import type { ImageSectionService } from "../data/image-section-service";
import { decodeRasterImage, encodeCanvasImage } from "../data/image-raster";
import { momentStackOffsetsY, normalizeMomentStackGapsY } from "../domain/moment-image-layout";

export const MOMENT_STACK_COPY_MAX_WIDTH = 2048;
export const MOMENT_STACK_COPY_MAX_HEIGHT = 8192;
export const MOMENT_STACK_COPY_MAX_PIXELS = 8_000_000;
export const MOMENT_STACK_COPY_MAX_PIXEL_RATIO = 2;

export interface MomentStackRasterPlanInput {
  topImageWidth: number;
  topImageHeight: number;
  displayWidth: number;
  imageCount: number;
  gapsY: readonly number[];
  pixelRatio?: number;
}

export interface MomentStackRasterPlan {
  width: number;
  height: number;
  scale: number;
  topHeight: number;
  offsetsY: number[];
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function planAtWidth(
  width: number,
  displayWidth: number,
  topAspect: number,
  offsetsDisplayY: readonly number[],
): MomentStackRasterPlan {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const scale = normalizedWidth / displayWidth;
  const topHeight = normalizedWidth * topAspect;
  const offsetsY = offsetsDisplayY.map((offset) => offset * scale);
  const depth = offsetsY.at(-1) ?? 0;
  return {
    width: normalizedWidth,
    height: Math.max(1, Math.ceil(topHeight + depth)),
    scale,
    topHeight,
    offsetsY,
  };
}

export function planMomentStackRaster(input: MomentStackRasterPlanInput): MomentStackRasterPlan {
  if (!Number.isFinite(input.topImageWidth) || input.topImageWidth <= 0
    || !Number.isFinite(input.topImageHeight) || input.topImageHeight <= 0) {
    throw new Error("Stacked Moment image has invalid dimensions");
  }
  const imageCount = Math.max(1, Math.trunc(input.imageCount));
  const displayWidth = positiveFinite(input.displayWidth, 760);
  const requestedPixelRatio = Math.min(
    MOMENT_STACK_COPY_MAX_PIXEL_RATIO,
    Math.max(1, positiveFinite(input.pixelRatio ?? 1, 1)),
  );
  const gapsY = normalizeMomentStackGapsY(input.gapsY, imageCount);
  const offsetsDisplayY = momentStackOffsetsY(gapsY, imageCount);
  const topAspect = input.topImageHeight / input.topImageWidth;

  let width = Math.min(MOMENT_STACK_COPY_MAX_WIDTH, displayWidth * requestedPixelRatio);
  let plan = planAtWidth(width, displayWidth, topAspect, offsetsDisplayY);
  const pixelCount = plan.width * plan.height;
  const constraintScale = Math.min(
    1,
    MOMENT_STACK_COPY_MAX_HEIGHT / plan.height,
    Math.sqrt(MOMENT_STACK_COPY_MAX_PIXELS / pixelCount),
  );
  if (constraintScale < 1) {
    width = Math.max(1, Math.floor(plan.width * constraintScale));
    plan = planAtWidth(width, displayWidth, topAspect, offsetsDisplayY);
  }
  if (plan.height > MOMENT_STACK_COPY_MAX_HEIGHT || plan.width * plan.height > MOMENT_STACK_COPY_MAX_PIXELS) {
    const finalScale = Math.min(
      MOMENT_STACK_COPY_MAX_HEIGHT / plan.height,
      Math.sqrt(MOMENT_STACK_COPY_MAX_PIXELS / (plan.width * plan.height)),
    );
    plan = planAtWidth(Math.max(1, Math.floor(plan.width * finalScale)), displayWidth, topAspect, offsetsDisplayY);
  }
  return plan;
}

export interface RasterizeMomentStackOptions {
  displayWidth: number;
  pixelRatio?: number;
}

export async function rasterizeMomentStackToPng(
  service: ImageSectionService,
  sourcePath: string,
  imagePaths: readonly string[],
  gapsY: readonly number[],
  options: RasterizeMomentStackOptions,
): Promise<Blob> {
  if (!imagePaths.length) throw new Error("There are no images to copy");

  // Keep only the first compressed asset in memory. Lower layers are read, decoded,
  // drawn, and closed one at a time so a large stack never retains every bitmap.
  const topAsset = await service.readAsset(imagePaths[0], sourcePath);
  const topProbe = await decodeRasterImage(topAsset.data, topAsset.contentType ?? "");
  let plan: MomentStackRasterPlan;
  try {
    plan = planMomentStackRaster({
      topImageWidth: topProbe.width,
      topImageHeight: topProbe.height,
      displayWidth: options.displayWidth,
      imageCount: imagePaths.length,
      gapsY,
      pixelRatio: options.pixelRatio,
    });
  } finally {
    topProbe.close();
  }

  const canvas = createEl("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, plan.width, plan.height);

  try {
    // Later DOM layers have a lower z-index. Draw from the back toward the front,
    // then draw the first image last so Canvas compositing matches the live stack.
    for (let index = imagePaths.length - 1; index >= 1; index -= 1) {
      const asset = await service.readAsset(imagePaths[index], sourcePath);
      const decoded = await decodeRasterImage(asset.data, asset.contentType ?? "");
      try {
        if (decoded.width <= 0 || decoded.height <= 0) throw new Error("Stacked Moment image has invalid dimensions");
        const height = plan.width * decoded.height / decoded.width;
        const bottom = plan.topHeight + (plan.offsetsY[index] ?? 0);
        context.drawImage(decoded.source, 0, bottom - height, plan.width, height);
      } finally {
        decoded.close();
      }
    }

    const top = await decodeRasterImage(topAsset.data, topAsset.contentType ?? "");
    try {
      context.drawImage(top.source, 0, 0, plan.width, plan.topHeight);
    } finally {
      top.close();
    }
    return await encodeCanvasImage(canvas, "image/png");
  } finally {
    // Release the backing store promptly after toBlob has copied the PNG bytes.
    canvas.width = 1;
    canvas.height = 1;
  }
}

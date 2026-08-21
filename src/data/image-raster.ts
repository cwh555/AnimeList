import { sha256Hex } from "../domain/content-hash";

export interface DecodedRasterImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

export async function decodeRasterImage(
  data: ArrayBuffer,
  contentType = "application/octet-stream",
): Promise<DecodedRasterImage> {
  const blob = new Blob([data], { type: contentType || "application/octet-stream" });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = createEl("img");
  image.src = objectUrl;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function encodeCanvasImage(
  canvas: HTMLCanvasElement,
  contentType: "image/png" | "image/webp",
  quality?: number,
): Promise<Blob> {
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error("Canvas has invalid dimensions");
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error(`${contentType === "image/png" ? "PNG" : "WebP"} encoding failed`));
    }, contentType, quality);
  });
}

export async function encodeRasterImage(
  decoded: DecodedRasterImage,
  width: number,
  contentType: "image/png" | "image/webp",
  quality?: number,
): Promise<Blob> {
  if (decoded.width <= 0 || decoded.height <= 0) throw new Error("Image has invalid dimensions");
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(targetWidth * decoded.height / decoded.width));
  const canvas = createEl("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);
  return encodeCanvasImage(canvas, contentType, quality);
}

export async function visualImageFingerprint(
  data: ArrayBuffer,
  contentType = "application/octet-stream",
): Promise<string> {
  const decoded = await decodeRasterImage(data, contentType);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) throw new Error("Image has invalid dimensions");
    const canvas = createEl("canvas");
    const sampleSize = 64;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, sampleSize, sampleSize);
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    const dimensions = new TextEncoder().encode(`${decoded.width}x${decoded.height}\0`);
    const canonical = new Uint8Array(dimensions.byteLength + pixels.byteLength);
    canonical.set(dimensions, 0);
    canonical.set(pixels, dimensions.byteLength);
    return sha256Hex(canonical.buffer);
  } finally {
    decoded.close();
  }
}

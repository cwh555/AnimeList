import type { ImageSectionService } from "../data/image-section-service";
import { decodeRasterImage, encodeRasterImage } from "../image-raster";

async function toPngBlob(data: ArrayBuffer, contentType: string): Promise<Blob> {
  if (contentType.split(";")[0].trim().toLocaleLowerCase() === "image/png") {
    return new Blob([data], { type: "image/png" });
  }
  const decoded = await decodeRasterImage(data, contentType);
  try {
    return await encodeRasterImage(decoded, decoded.width, "image/png");
  } finally {
    decoded.close();
  }
}

export async function copyImageToClipboard(
  service: ImageSectionService,
  sourcePath: string,
  imagePath: string,
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard writing is unavailable in this Obsidian build");
  }
  const asset = await service.readAsset(imagePath, sourcePath);
  const png = await toPngBlob(asset.data, asset.contentType ?? "");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

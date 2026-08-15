import type { ImageSectionService, ImageSectionAssetInput } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
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

function clipboardAvailable(): boolean {
  return Boolean(navigator.clipboard?.write && typeof ClipboardItem !== "undefined");
}

async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function dataUrlAsset(dataUrl: string, index: number): ImageSectionAssetInput | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let position = 0; position < binary.length; position += 1) bytes[position] = binary.charCodeAt(position);
  const extension = match[1].toLocaleLowerCase() === "image/jpeg" ? "jpg" : match[1].split("/")[1].toLocaleLowerCase();
  return { name: `clipboard-${index + 1}.${extension}`, data: bytes.buffer, contentType: match[1] };
}

export async function imageAssetsFromClipboard(event: ClipboardEvent): Promise<ImageSectionAssetInput[]> {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) return Promise.all(files.map((file) => imageAssetFromFile(file)));

  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!html) return [];
  const assets: ImageSectionAssetInput[] = [];
  const regex = /<img\b[^>]*\bsrc=["'](data:image\/(?:png|jpeg|webp|gif|avif);base64,[^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const asset = dataUrlAsset(match[1], assets.length);
    if (asset) assets.push(asset);
  }
  return assets;
}

export async function copyImageToClipboard(
  service: ImageSectionService,
  sourcePath: string,
  imagePath: string,
): Promise<void> {
  await copyImagesToClipboard(service, sourcePath, [imagePath]);
}

export async function copyImagesToClipboard(
  service: ImageSectionService,
  sourcePath: string,
  imagePaths: readonly string[],
): Promise<void> {
  if (!clipboardAvailable()) {
    throw new Error("Image clipboard writing is unavailable in this Obsidian build");
  }
  const paths = [...imagePaths].filter(Boolean);
  if (!paths.length) throw new Error("There are no images to copy");
  const blobs = await Promise.all(paths.map(async (path) => {
    const asset = await service.readAsset(path, sourcePath);
    return toPngBlob(asset.data, asset.contentType ?? "");
  }));
  const items = blobs.map((blob) => new ClipboardItem({ "image/png": blob }));
  if (items.length === 1) {
    await navigator.clipboard.write(items);
    return;
  }
  try {
    await navigator.clipboard.write(items);
    return;
  } catch {
    // Chromium/platform clipboard implementations often accept only one image item.
    // Fall back to an HTML fragment containing every image. AnimeList's image picker
    // understands this representation, and compatible external editors paste all images.
  }
  const sources = await Promise.all(blobs.map(blobDataUrl));
  const html = `<div data-animelist-images="true">${sources.map((src) => `<img src="${src}">`).join("")}</div>`;
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
  })]);
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Text clipboard writing is unavailable in this Obsidian build");
  await navigator.clipboard.writeText(text);
}

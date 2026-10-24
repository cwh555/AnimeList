/** Small clipboard boundary shared by image features and presentation export. */
export async function copyPngBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard writing is unavailable in this Obsidian build");
  }
  if (blob.type.split(";")[0].trim().toLocaleLowerCase() !== "image/png") {
    throw new Error("Clipboard image must be PNG");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

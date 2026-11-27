/** Identify supported raster formats by their container signatures, not a URL or HTTP header.
 * This is a bounded signature check, not a full image decoder. */
export function remoteCoverExtension(data: ArrayBuffer): "jpg" | "png" | "webp" | "avif" | "gif" {
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > 20 * 1024 * 1024) {
    throw new Error("Cover must be a nonempty image no larger than 20 MB.");
  }
  const b = new Uint8Array(data);
  const at = (offset: number, signature: readonly number[]): boolean =>
    signature.every((byte, index) => b[offset + index] === byte);
  const ascii = (offset: number, value: string): boolean => at(offset, [...value].map(c => c.charCodeAt(0)));
  if (at(0, [255, 216, 255])) return "jpg";
  if (at(0, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "webp";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "gif";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "avif";
  throw new Error("Cover response is not a supported raster image.");
}

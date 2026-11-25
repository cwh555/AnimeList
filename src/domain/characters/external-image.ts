import { SUPPORTED_IMAGE_EXTENSIONS } from "../image-section";

const supported = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
export function externalImageUri(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("External image path is required");
  let url: URL;
  if (/^file:\/\//i.test(value)) {
    url = new URL(value);
  } else if (/^([a-zA-Z]:[\\/]|\/)/.test(value)) {
    const path = value.replace(/\\/g, "/");
    url = new URL("file:///");
    url.pathname = /^[a-zA-Z]:\//.test(path) ? "/" + path : path;
  } else throw new Error("Please enter an absolute local image path");
  if (url.protocol !== "file:" || url.host) throw new Error("Only local files are supported");
  const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  if (!supported.has(ext)) throw new Error("Unsupported external image format");
  return url.href;
}
export function localPathFromImageUri(uri: string): string {
  const url = new URL(externalImageUri(uri));
  const decoded = decodeURIComponent(url.pathname);
  return /^\/[a-zA-Z]:\//.test(decoded) ? decoded.slice(1) : decoded;
}

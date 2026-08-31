import { sanitizePathPart } from "./value-normalization";

export function mediaNoteFilenameForTitle(title: unknown): string {
  return `${sanitizePathPart(String(title ?? ""))}.md`;
}

export function mediaNoteFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

export function mediaNoteFilename(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

export function isMediaNoteFilenameAligned(path: string, title: unknown): boolean {
  return mediaNoteFilename(path) === mediaNoteFilenameForTitle(title);
}

export function mediaTitleChanged(previousTitle: unknown, nextTitle: unknown): boolean {
  if (typeof previousTitle !== "string") return false;
  return previousTitle.trim() !== String(nextTitle ?? "").trim();
}

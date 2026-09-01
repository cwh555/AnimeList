import { normalizePath } from "obsidian";
import { imageSectionRootFromCoverFolder } from "./image-section";

export type ManagedMediaAssetKind = "cover" | "image";

export interface MediaAssetCleanupResult {
  removedManagedFiles: number;
  removedJournalFiles: number;
  removedCacheFiles: number;
}

const MEDIA_TYPES = new Set(["anime", "manga", "novel"]);
const IMAGE_TYPES = new Set(["anime", "manga", "novel", "other"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

export function normalizeMediaAssetPath(value: unknown): string {
  return normalizePath(typeof value === "string" ? value.trim() : "").replace(/^\/+/, "");
}

function pathParts(value: string): string[] {
  return normalizeMediaAssetPath(value).split("/").filter(Boolean);
}

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLocaleLowerCase() : "";
}

function relativeParts(path: string, root: string): string[] | null {
  const cleanPath = normalizeMediaAssetPath(path);
  const cleanRoot = normalizeMediaAssetPath(root).replace(/\/+$/g, "");
  if (!cleanRoot || !cleanPath.startsWith(`${cleanRoot}/`)) return null;
  return pathParts(cleanPath.slice(cleanRoot.length + 1));
}

export function managedMediaAssetKind(path: string, coverFolder: string): ManagedMediaAssetKind | null {
  if (!IMAGE_EXTENSIONS.has(extensionOf(path))) return null;

  const coverRelative = relativeParts(path, coverFolder);
  if (coverRelative && coverRelative.length >= 2 && MEDIA_TYPES.has(coverRelative[0]?.toLocaleLowerCase() ?? "")) {
    return "cover";
  }

  const imageRoot = imageSectionRootFromCoverFolder(coverFolder);
  const imageRelative = relativeParts(path, imageRoot);
  if (imageRelative
    && imageRelative.length >= 3
    && IMAGE_TYPES.has(imageRelative[0]?.toLocaleLowerCase() ?? "")) {
    return "image";
  }
  return null;
}

export function shouldRemoveManagedMediaAsset(
  path: string,
  coverFolder: string,
  referencedPaths: ReadonlySet<string>,
  leasedPaths: ReadonlySet<string>,
): boolean {
  const normalized = normalizeMediaAssetPath(path);
  if (!managedMediaAssetKind(normalized, coverFolder)) return false;
  return !referencedPaths.has(normalized) && !leasedPaths.has(normalized);
}

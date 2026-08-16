import { normalizePath } from "obsidian";
import { sha256Hex } from "./content-hash";
import { sanitizePathPart, slugify, stringValue } from "./value-normalization";
import type { MediaType } from "./media-types";

export const IMAGE_SECTION_LANGUAGE = "animelist-images";
export const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"] as const;
export type SupportedImageExtension = typeof SUPPORTED_IMAGE_EXTENSIONS[number];

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
const MIME_EXTENSION: Readonly<Record<string, SupportedImageExtension>> = Object.freeze({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
});

export interface ImageSectionLocator {
  source: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface ImageSectionBlock {
  lineStart: number;
  lineEnd: number;
  source: string;
  paths: string[];
}

export interface ImageSectionInsertionPlan {
  at: { line: number; ch: number };
  text: string;
  cursor: { line: number; ch: number };
}

export function imageSectionInsertionPlan(line: number, lineText: string): ImageSectionInsertionPlan {
  const safeLine = Math.max(0, Math.trunc(line));
  const content = String(lineText ?? "");
  const blank = content.trim().length === 0;
  const prefix = blank ? "" : "\n\n";
  const text = `${prefix}\`\`\`${IMAGE_SECTION_LANGUAGE}\n\`\`\`\n`;
  return {
    at: { line: safeLine, ch: blank ? 0 : content.length },
    text,
    cursor: { line: safeLine + (blank ? 2 : 4), ch: 0 },
  };
}

function cleanWikiPath(value: string): string {
  const wiki = /^!?\[\[([\s\S]*?)\]\]$/.exec(value.trim());
  if (!wiki) return value;
  return wiki[1].split("|")[0].trim();
}

export function normalizeImageSectionPath(value: unknown): string {
  let path = stringValue(value).trim();
  path = path.replace(/^[-*+]\s+/, "").trim();
  path = cleanWikiPath(path);
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return normalizePath(path).replace(/^\/+/, "");
}

export function parseImageSectionSource(source: unknown): string[] {
  const unique = new Set<string>();
  for (const line of stringValue(source).split(/\r?\n/)) {
    const path = normalizeImageSectionPath(line);
    if (!path || line.trim().startsWith("#")) continue;
    unique.add(path);
  }
  return [...unique];
}

export function serializeImageSectionPaths(paths: Iterable<unknown>): string {
  const unique = new Set<string>();
  for (const value of paths) {
    const path = normalizeImageSectionPath(value);
    if (path) unique.add(path);
  }
  return [...unique].map((path) => `- ${path}`).join("\n");
}

export function findImageSectionBlocks(markdown: unknown): ImageSectionBlock[] {
  const text = stringValue(markdown);
  const lines = text.split(/\r?\n/);
  const blocks: ImageSectionBlock[] = [];
  for (let lineStart = 0; lineStart < lines.length; lineStart += 1) {
    if (!/^\s*```animelist-images(?:\s.*)?\s*$/.test(lines[lineStart])) continue;
    let lineEnd = lineStart + 1;
    while (lineEnd < lines.length && !/^\s*```\s*$/.test(lines[lineEnd])) lineEnd += 1;
    if (lineEnd >= lines.length) continue;
    const source = lines.slice(lineStart + 1, lineEnd).join("\n");
    blocks.push({ lineStart, lineEnd, source, paths: parseImageSectionSource(source) });
    lineStart = lineEnd;
  }
  return blocks;
}

function sameSectionSource(left: string, right: string): boolean {
  return serializeImageSectionPaths(parseImageSectionSource(left))
    === serializeImageSectionPaths(parseImageSectionSource(right));
}

function locateImageSection(markdown: string, locator: ImageSectionLocator): ImageSectionBlock {
  const blocks = findImageSectionBlocks(markdown);
  const hint = typeof locator.lineStart === "number" ? locator.lineStart : null;
  if (hint !== null) {
    const containing = blocks.find((block) => hint >= block.lineStart && hint <= block.lineEnd);
    if (containing) return containing;
  }
  const matches = blocks.filter((block) => sameSectionSource(block.source, locator.source));
  if (matches.length === 1) return matches[0];
  if (hint !== null && matches.length > 1) {
    return [...matches].sort((left, right) => (
      Math.abs(left.lineStart - hint) - Math.abs(right.lineStart - hint)
    ))[0];
  }
  throw new Error("Could not safely locate this image section in the note");
}

export function replaceImageSectionPaths(
  markdown: unknown,
  locator: ImageSectionLocator,
  nextPaths: Iterable<unknown>,
): string {
  const text = stringValue(markdown);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const block = locateImageSection(text, locator);
  const source = serializeImageSectionPaths(nextPaths);
  const replacement = [lines[block.lineStart], ...(source ? source.split("\n") : []), lines[block.lineEnd]];
  lines.splice(block.lineStart, block.lineEnd - block.lineStart + 1, ...replacement);
  return lines.join(newline);
}

export function allImageSectionPaths(markdown: unknown): string[] {
  const unique = new Set<string>();
  for (const block of findImageSectionBlocks(markdown)) {
    for (const path of block.paths) unique.add(path);
  }
  return [...unique];
}

export function imageSectionRootFromCoverFolder(coverFolder: unknown): string {
  const normalized = normalizePath(stringValue(coverFolder)).replace(/^\/+|\/+$/g, "");
  const parts = normalized ? normalized.split("/") : [];
  if (parts.length > 0) parts.pop();
  return normalizePath([...parts, "Images"].filter(Boolean).join("/"));
}

function shortPathHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

export function imageSectionFolderForNote(input: {
  coverFolder: unknown;
  mediaType: MediaType | null;
  title: unknown;
  sourceProvider?: unknown;
  sourceId?: unknown;
  notePath: string;
}): string {
  const root = imageSectionRootFromCoverFolder(input.coverFolder);
  const mediaType = input.mediaType ?? "other";
  const title = slugify(input.title, "media");
  const provider = sanitizePathPart(input.sourceProvider, "").toLocaleLowerCase().replace(/\s+/g, "-");
  const sourceId = sanitizePathPart(input.sourceId, "").replace(/\s+/g, "-");
  const identity = provider && sourceId
    ? `${title}-${provider}-${sourceId}`
    : `${title}-${shortPathHash(normalizePath(input.notePath))}`;
  return normalizePath(`${root}/${mediaType}/${identity}`);
}

export function imageExtensionFor(name: unknown, contentType: unknown = ""): SupportedImageExtension | null {
  const cleanName = stringValue(name).split(/[?#]/)[0];
  const rawExtension = cleanName.includes(".") ? cleanName.split(".").pop()?.toLocaleLowerCase() ?? "" : "";
  if (SUPPORTED_EXTENSION_SET.has(rawExtension)) {
    return rawExtension === "jpeg" ? "jpg" : rawExtension as SupportedImageExtension;
  }
  const mime = stringValue(contentType).split(";")[0].trim().toLocaleLowerCase();
  return MIME_EXTENSION[mime] ?? null;
}

export function isSupportedImageName(name: unknown, contentType: unknown = ""): boolean {
  return imageExtensionFor(name, contentType) !== null;
}

export function imageBaseName(name: unknown, fallback = "image"): string {
  const clean = stringValue(name).split(/[?#]/)[0].split("/").pop() ?? "";
  const extension = clean.includes(".") ? clean.slice(clean.lastIndexOf(".")) : "";
  return sanitizePathPart(extension ? clean.slice(0, -extension.length) : clean, fallback);
}


export function imageContentHash(data: ArrayBuffer): Promise<string> {
  return sha256Hex(data);
}

export function imageContentTypeForPath(pathValue: unknown): string {
  const extension = imageExtensionFor(pathValue);
  if (extension === "jpg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "application/octet-stream";
}

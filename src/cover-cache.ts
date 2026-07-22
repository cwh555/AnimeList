import type { App, TFile } from "obsidian";
import { normalizePath } from "obsidian";
import type { CoverSources } from "./types";

export const COVER_THUMBNAIL_WIDTHS = [24, 320, 640] as const;
export const COVER_CACHE_POLICY = {
  maxAgeMs: 60 * 24 * 60 * 60 * 1000,
  maxBytes: 256 * 1024 * 1024,
  targetBytes: 192 * 1024 * 1024,
} as const;

const CACHE_FORMAT_VERSION = "v1";
const WEBP_QUALITY = 0.82;
const PLACEHOLDER_QUALITY = 0.58;

export interface CoverCacheFileRecord {
  path: string;
  size: number;
  mtime: number;
}

export interface CoverCacheCleanupPolicy {
  maxAgeMs: number;
  maxBytes: number;
  targetBytes: number;
}

interface DecodedCover {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

function unsignedHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function coverCacheKey(sourcePath: string, sourceMtime: number): string {
  const value = `${CACHE_FORMAT_VERSION}\u0000${normalizePath(sourcePath)}\u0000${Math.trunc(sourceMtime)}`;
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
    right ^= right >>> 13;
  }
  return `${unsignedHex(left)}${unsignedHex(right)}`;
}

export function coverCachePaths(root: string, sourcePath: string, sourceMtime: number): Record<"placeholder" | "small" | "large", string> {
  const key = coverCacheKey(sourcePath, sourceMtime);
  return {
    placeholder: normalizePath(`${root}/${key}-24.webp`),
    small: normalizePath(`${root}/${key}-320.webp`),
    large: normalizePath(`${root}/${key}-640.webp`),
  };
}

function cacheGroupKey(path: string): string {
  return path.replace(/-(?:24|320|640)\.webp$/i, "");
}

export function planCoverCacheCleanup(
  files: CoverCacheFileRecord[],
  now: number,
  policy: CoverCacheCleanupPolicy = COVER_CACHE_POLICY,
): string[] {
  const groups = new Map<string, { files: CoverCacheFileRecord[]; size: number; newestMtime: number }>();
  for (const file of files) {
    const key = cacheGroupKey(file.path);
    const group = groups.get(key) ?? { files: [], size: 0, newestMtime: 0 };
    group.files.push(file);
    group.size += Math.max(0, file.size);
    group.newestMtime = Math.max(group.newestMtime, file.mtime);
    groups.set(key, group);
  }

  const remove = new Set<string>();
  const retained: Array<{ files: CoverCacheFileRecord[]; size: number; newestMtime: number }> = [];
  const staleBefore = now - policy.maxAgeMs;
  for (const group of groups.values()) {
    const widths = new Set(group.files.map((file) => /-(24|320|640)\.webp$/i.exec(file.path)?.[1] ?? ""));
    const incomplete = widths.size !== 3 || !widths.has("24") || !widths.has("320") || !widths.has("640");
    if (incomplete || group.newestMtime < staleBefore) {
      group.files.forEach((file) => remove.add(file.path));
    } else {
      retained.push(group);
    }
  }

  let retainedBytes = retained.reduce((total, group) => total + group.size, 0);
  if (retainedBytes > policy.maxBytes) {
    retained.sort((left, right) => left.newestMtime - right.newestMtime);
    for (const group of retained) {
      if (retainedBytes <= policy.targetBytes) break;
      group.files.forEach((file) => remove.add(file.path));
      retainedBytes -= group.size;
    }
  }
  return Array.from(remove).sort();
}

async function waitForIdle(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve());
      return;
    }
    window.setTimeout(resolve, 32);
  });
}

async function decodeCover(data: ArrayBuffer): Promise<DecodedCover> {
  const blob = new Blob([data]);
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

async function renderWebp(decoded: DecodedCover, width: number): Promise<ArrayBuffer> {
  if (decoded.width <= 0 || decoded.height <= 0) throw new Error("Cover image has invalid dimensions");
  const height = Math.max(1, Math.round(width * decoded.height / decoded.width));
  const canvas = createEl("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(decoded.source, 0, 0, width, height);
  const quality = width === COVER_THUMBNAIL_WIDTHS[0] ? PLACEHOLDER_QUALITY : WEBP_QUALITY;
  const output = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("WebP thumbnail encoding failed"));
    }, "image/webp", quality);
  });
  return output.arrayBuffer();
}

export class CoverThumbnailCache {
  readonly root: string;
  private readonly app: App;
  private readonly files = new Set<string>();
  private readonly pending = new Map<string, Promise<CoverSources>>();
  private cleanupHandle: number | null = null;

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.root = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/cache/covers`);
  }

  async initialize(): Promise<void> {
    await this.ensureFolder(this.root);
    const listing = await this.app.vault.adapter.list(this.root);
    this.files.clear();
    listing.files
      .filter((path) => path.toLocaleLowerCase().endsWith(".webp"))
      .forEach((path) => this.files.add(normalizePath(path)));
  }

  dispose(): void {
    if (this.cleanupHandle !== null) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(this.cleanupHandle);
      else window.clearTimeout(this.cleanupHandle);
      this.cleanupHandle = null;
    }
  }

  scheduleCleanup(): void {
    if (this.cleanupHandle !== null) return;
    const run = () => {
      this.cleanupHandle = null;
      void this.cleanup().catch((error: unknown) => {
        console.warn("AnimeList cover cache cleanup failed", error);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      this.cleanupHandle = window.requestIdleCallback(run);
    } else {
      this.cleanupHandle = window.setTimeout(run, 60_000);
    }
  }

  getSources(file: TFile): CoverSources | undefined {
    const paths = coverCachePaths(this.root, file.path, file.stat.mtime);
    if (![paths.placeholder, paths.small, paths.large].every((path) => this.files.has(path))) return undefined;
    const placeholder = this.app.vault.adapter.getResourcePath(paths.placeholder);
    const small = this.app.vault.adapter.getResourcePath(paths.small);
    const large = this.app.vault.adapter.getResourcePath(paths.large);
    return {
      src: small,
      srcset: `${small} 320w, ${large} 640w`,
      placeholder,
    };
  }

  async optimizeFile(file: TFile, idle = false): Promise<CoverSources> {
    const existing = this.getSources(file);
    if (existing) return existing;
    const key = coverCacheKey(file.path, file.stat.mtime);
    const active = this.pending.get(key);
    if (active !== undefined) return active;
    const task = this.generate(file, idle).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  async optimizeFiles(files: TFile[], onProgress?: (completed: number, total: number) => void): Promise<{ optimized: number; failed: number }> {
    let optimized = 0;
    let failed = 0;
    for (const file of files) {
      try {
        await this.optimizeFile(file, true);
        optimized += 1;
      } catch (error) {
        failed += 1;
        console.warn(`AnimeList could not optimize cover ${file.path}`, error);
      }
      onProgress?.(optimized + failed, files.length);
    }
    await this.cleanup();
    return { optimized, failed };
  }

  async cleanup(): Promise<number> {
    await this.ensureFolder(this.root);
    const listing = await this.app.vault.adapter.list(this.root);
    const records: CoverCacheFileRecord[] = [];
    for (const path of listing.files) {
      const normalized = normalizePath(path);
      if (!normalized.toLocaleLowerCase().endsWith(".webp")) continue;
      const stat = await this.app.vault.adapter.stat(normalized);
      if (stat?.type !== "file") continue;
      records.push({ path: normalized, size: stat.size, mtime: stat.mtime });
    }
    const removals = planCoverCacheCleanup(records, Date.now());
    for (const path of removals) {
      await this.app.vault.adapter.remove(path);
      this.files.delete(path);
    }
    return removals.length;
  }

  async clear(): Promise<number> {
    await this.ensureFolder(this.root);
    const listing = await this.app.vault.adapter.list(this.root);
    let removed = 0;
    for (const path of listing.files) {
      if (!path.toLocaleLowerCase().endsWith(".webp")) continue;
      await this.app.vault.adapter.remove(path);
      this.files.delete(normalizePath(path));
      removed += 1;
    }
    return removed;
  }

  private async generate(file: TFile, idle: boolean): Promise<CoverSources> {
    if (idle) await waitForIdle();
    const paths = coverCachePaths(this.root, file.path, file.stat.mtime);
    const created: string[] = [];
    const sourceData = await this.app.vault.adapter.readBinary(file.path);
    const decoded = await decodeCover(sourceData);
    try {
      const variants: Array<[number, string]> = [
        [640, paths.large],
        [320, paths.small],
        [24, paths.placeholder],
      ];
      for (const [width, path] of variants) {
        if (idle) await waitForIdle();
        const output = await renderWebp(decoded, width);
        await this.app.vault.adapter.writeBinary(path, output);
        this.files.add(path);
        created.push(path);
      }
    } catch (error) {
      for (const path of created) {
        try {
          await this.app.vault.adapter.remove(path);
        } catch {
          // Best-effort rollback; cleanup will remove any remaining partial group.
        }
        this.files.delete(path);
      }
      throw error;
    } finally {
      decoded.close();
    }
    const sources = this.getSources(file);
    if (!sources) throw new Error("Cover thumbnail cache is incomplete");
    return sources;
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = normalizePath(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await this.app.vault.adapter.exists(current)) await this.app.vault.adapter.mkdir(current);
    }
  }
}

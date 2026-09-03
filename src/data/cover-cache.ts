import type { App, TFile } from "obsidian";
import { normalizePath } from "obsidian";
import type { CoverSources } from "../types";
import { decodeRasterImage, encodeRasterImage } from "./image-raster";
import { moveAdapterFileToVaultTrash } from "./vault-trash";

export const COVER_THUMBNAIL_WIDTHS = [24, 320, 640] as const;
export const COVER_CACHE_POLICY = {
  maxBytes: 256 * 1024 * 1024,
  targetBytes: 192 * 1024 * 1024,
} as const;

const CACHE_FORMAT_VERSION = "v2";
const deferredCoverSources = new WeakMap<CoverSources, () => CoverSources | undefined>();

export function peekCoverSources(sources: CoverSources | undefined): CoverSources | undefined {
  if (!sources) return undefined;
  const peek = deferredCoverSources.get(sources);
  return peek ? peek() : sources;
}
const WEBP_QUALITY = 0.82;
const PLACEHOLDER_QUALITY = 0.58;

export interface CoverCacheFileRecord {
  path: string;
  size: number;
  mtime: number;
}

export interface CoverCacheCleanupPolicy {
  maxBytes: number;
  targetBytes: number;
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

export function coverCachePaths(
  root: string,
  sourcePath: string,
  sourceMtime: number,
): Record<"placeholder" | "small" | "large", string> {
  const key = coverCacheKey(sourcePath, sourceMtime);
  return {
    placeholder: normalizePath(`${root}/${key}-24.webp`),
    small: normalizePath(`${root}/${key}-320.webp`),
    large: normalizePath(`${root}/${key}-640.webp`),
  };
}

export function coverCacheGroupKey(path: string): string {
  return path.replace(/-(?:24|320|640)\.webp$/i, "");
}

export function planCoverCacheCleanup(
  files: CoverCacheFileRecord[],
  validGroupKeys?: ReadonlySet<string>,
  policy: CoverCacheCleanupPolicy = COVER_CACHE_POLICY,
): string[] {
  const groups = new Map<string, { files: CoverCacheFileRecord[]; size: number; newestMtime: number }>();
  for (const file of files) {
    const key = coverCacheGroupKey(file.path);
    const group = groups.get(key) ?? { files: [], size: 0, newestMtime: 0 };
    group.files.push(file);
    group.size += Math.max(0, file.size);
    group.newestMtime = Math.max(group.newestMtime, file.mtime);
    groups.set(key, group);
  }

  const remove = new Set<string>();
  const retained: Array<{ key: string; files: CoverCacheFileRecord[]; size: number; newestMtime: number }> = [];
  for (const [key, group] of groups) {
    const widths = new Set(group.files.map((file) => /-(24|320|640)\.webp$/i.exec(file.path)?.[1] ?? ""));
    const incomplete = widths.size !== 3 || !widths.has("24") || !widths.has("320") || !widths.has("640");
    const orphan = validGroupKeys !== undefined && !validGroupKeys.has(key);
    if (incomplete || orphan) {
      group.files.forEach((file) => remove.add(file.path));
    } else {
      retained.push({ key, ...group });
    }
  }

  let retainedBytes = retained.reduce((total, group) => total + group.size, 0);
  if (retainedBytes > policy.maxBytes) {
    retained.sort((left, right) => left.newestMtime - right.newestMtime || left.key.localeCompare(right.key));
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
    window.setTimeout(resolve, 1500);
  });
}

export class CoverThumbnailCache {
  readonly root: string;
  private readonly app: App;
  private readonly files = new Set<string>();
  private readonly pending = new Map<string, Promise<CoverSources>>();
  private readonly queued = new Map<string, TFile>();
  private readonly knownSources = new Map<string, TFile>();
  private readonly onDrain?: () => void;
  private cleanupHandle: number | null = null;
  private workerHandle: number | null = null;
  private disposed = false;
  private processedSinceDrain = false;

  constructor(app: App, pluginId: string, onDrain?: () => void, cacheFolder = "covers") {
    this.app = app;
    this.root = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/cache/${cacheFolder}`);
    this.onDrain = onDrain;
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
    this.disposed = true;
    this.queued.clear();
    if (this.cleanupHandle !== null) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(this.cleanupHandle);
      else window.clearTimeout(this.cleanupHandle);
      this.cleanupHandle = null;
    }
    if (this.workerHandle !== null) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(this.workerHandle);
      else window.clearTimeout(this.workerHandle);
      this.workerHandle = null;
    }
  }

  scheduleCleanup(): void {
    if (this.disposed || this.cleanupHandle !== null) return;
    const run = () => {
      this.cleanupHandle = null;
      void this.cleanup().catch((error: unknown) => {
        console.warn("AnimeList cover cache cleanup failed", error);
      });
    };
    if (typeof window.requestIdleCallback === "function") this.cleanupHandle = window.requestIdleCallback(run);
    else this.cleanupHandle = window.setTimeout(run, 60_000);
  }

  getSources(file: TFile): CoverSources | undefined {
    this.knownSources.set(file.path, file);
    const sources = this.readSources(file);
    if (!sources) this.enqueue(file);
    return sources;
  }

  getDeferredSources(file: TFile): CoverSources {
    this.knownSources.set(file.path, file);
    const existing = this.readSources(file);
    if (existing) return existing;

    let requested = false;
    const request = (): CoverSources | undefined => {
      const sources = this.readSources(file);
      if (sources) return sources;
      if (!requested) {
        requested = true;
        this.enqueue(file);
      }
      return undefined;
    };
    const deferred: CoverSources = {
      get src() { return request()?.src ?? ""; },
      get srcset() { return request()?.srcset ?? ""; },
      get placeholder() { return request()?.placeholder ?? ""; },
    };
    deferredCoverSources.set(deferred, () => this.readSources(file));
    return deferred;
  }

  enqueue(file: TFile): boolean {
    this.knownSources.set(file.path, file);
    if (this.disposed || this.hasCompleteGroup(file)) return false;
    const key = coverCacheKey(file.path, file.stat.mtime);
    if (this.queued.has(key) || this.pending.has(key)) return false;
    this.queued.set(key, file);
    this.scheduleWorker();
    return true;
  }

  enqueueFiles(files: Iterable<TFile>): number {
    let added = 0;
    for (const file of files) {
      if (this.enqueue(file)) added += 1;
    }
    return added;
  }

  async optimizeFile(file: TFile, idle = false): Promise<CoverSources> {
    this.knownSources.set(file.path, file);
    const existing = this.readSources(file);
    if (existing) return existing;
    if (!idle) {
      this.enqueue(file);
      const original = this.app.vault.adapter.getResourcePath(file.path);
      return { src: original, srcset: "", placeholder: "" };
    }
    const key = coverCacheKey(file.path, file.stat.mtime);
    const active = this.pending.get(key);
    if (active !== undefined) return active;
    const task = this.generate(file, true).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  async optimizeFiles(
    files: TFile[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<{ optimized: number; failed: number }> {
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
    await this.cleanupForFiles(files);
    return { optimized, failed };
  }

  async cleanup(): Promise<number> {
    return this.cleanupWithKeys(undefined);
  }

  async cleanupForFiles(sourceFiles: Iterable<TFile>): Promise<number> {
    const validGroupKeys = new Set<string>();
    for (const file of sourceFiles) {
      this.knownSources.set(file.path, file);
      validGroupKeys.add(coverCacheGroupKey(coverCachePaths(this.root, file.path, file.stat.mtime).small));
    }
    return this.cleanupWithKeys(validGroupKeys);
  }

  async clear(): Promise<number> {
    await this.ensureFolder(this.root);
    this.queued.clear();
    const listing = await this.app.vault.adapter.list(this.root);
    let removed = 0;
    for (const path of listing.files) {
      if (!path.toLocaleLowerCase().endsWith(".webp")) continue;
      const moved = await moveAdapterFileToVaultTrash(this.app.vault.adapter, path, "thumbnail-cache");
      if (!moved) continue;
      this.files.delete(normalizePath(path));
      removed += 1;
    }
    return removed;
  }

  private readSources(file: TFile): CoverSources | undefined {
    const paths = coverCachePaths(this.root, file.path, file.stat.mtime);
    if (![paths.placeholder, paths.small, paths.large].every((path) => this.files.has(path))) return undefined;
    const small = this.app.vault.adapter.getResourcePath(paths.small);
    const large = this.app.vault.adapter.getResourcePath(paths.large);
    // Keep the existing 24px cache file as part of the immutable cache group,
    // but do not expose it as a UI placeholder: enlarging it behind a lazy
    // cover produces the full-card blurred frame reported by users.
    return { src: small, srcset: `${small} 320w, ${large} 640w`, placeholder: "" };
  }

  private hasCompleteGroup(file: TFile): boolean {
    const paths = coverCachePaths(this.root, file.path, file.stat.mtime);
    return [paths.placeholder, paths.small, paths.large].every((path) => this.files.has(path));
  }

  private scheduleWorker(): void {
    if (this.disposed || this.workerHandle !== null || this.queued.size === 0) return;
    const run = () => {
      this.workerHandle = null;
      void this.processOneQueued();
    };
    if (typeof window.requestIdleCallback === "function") this.workerHandle = window.requestIdleCallback(run);
    else this.workerHandle = window.setTimeout(run, 2000);
  }

  private async processOneQueued(): Promise<void> {
    if (this.disposed) return;
    const key = Array.from(this.queued.keys())[0];
    if (key === undefined) return;
    const file = this.queued.get(key);
    this.queued.delete(key);
    if (!file) {
      this.scheduleWorker();
      return;
    }
    try {
      await this.optimizeFile(file, true);
      this.processedSinceDrain = true;
    } catch (error) {
      console.warn(`AnimeList could not optimize cover ${file.path}`, error);
    } finally {
      if (this.queued.size > 0) this.scheduleWorker();
      else await this.finishDrain();
    }
  }

  private async finishDrain(): Promise<void> {
    if (!this.processedSinceDrain) return;
    this.processedSinceDrain = false;
    try {
      await this.cleanupForFiles(this.knownSources.values());
    } catch (error) {
      console.warn("AnimeList cover cache cleanup after backfill failed", error);
    }
    this.onDrain?.();
  }

  private async cleanupWithKeys(validGroupKeys?: ReadonlySet<string>): Promise<number> {
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
    const removals = planCoverCacheCleanup(records, validGroupKeys);
    let removed = 0;
    for (const path of removals) {
      const moved = await moveAdapterFileToVaultTrash(this.app.vault.adapter, path, "thumbnail-cache");
      if (!moved) continue;
      this.files.delete(path);
      removed += 1;
    }
    return removed;
  }

  private async generate(file: TFile, idle: boolean): Promise<CoverSources> {
    if (idle) await waitForIdle();
    const paths = coverCachePaths(this.root, file.path, file.stat.mtime);
    const created: string[] = [];
    const sourceData = await this.app.vault.adapter.readBinary(file.path);
    const decoded = await decodeRasterImage(sourceData);
    try {
      const variants: Array<[number, string]> = [[640, paths.large], [320, paths.small], [24, paths.placeholder]];
      for (const [width, path] of variants) {
        if (idle) await waitForIdle();
        const quality = width === COVER_THUMBNAIL_WIDTHS[0] ? PLACEHOLDER_QUALITY : WEBP_QUALITY;
        const output = await encodeRasterImage(decoded, width, "image/webp", quality);
        await this.app.vault.adapter.writeBinary(path, await output.arrayBuffer());
        this.files.add(path);
        created.push(path);
      }
    } catch (error) {
      for (const path of created) {
        try {
          const moved = await moveAdapterFileToVaultTrash(this.app.vault.adapter, path, "thumbnail-cache");
          if (moved) this.files.delete(path);
        } catch {
          // Best-effort rollback; source-aware cleanup removes any remaining partial group.
        }
      }
      throw error;
    } finally {
      decoded.close();
    }
    const sources = this.readSources(file);
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

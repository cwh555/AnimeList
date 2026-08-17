import { TFile, type App } from "obsidian";
import { buildImageGalleryWork, type ImageGalleryWork } from "../domain/image-gallery";
import type { MediaItem } from "../domain/media-types";

export interface ImageGalleryHost {
  app: App;
}

interface CachedWork {
  mtime: number;
  size: number;
  work: ImageGalleryWork | null;
}

async function collectInBatches<T, R>(
  values: readonly T[],
  concurrency: number,
  read: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await read(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export class ImageGalleryService {
  private readonly cache = new Map<string, CachedWork>();

  constructor(private readonly host: ImageGalleryHost) {}

  async collect(items: readonly MediaItem[]): Promise<ImageGalleryWork[]> {
    const activePaths = new Set(items.map((item) => item.filePath));
    for (const path of this.cache.keys()) {
      if (!activePaths.has(path)) this.cache.delete(path);
    }
    const works = await collectInBatches(items, 8, (item) => this.readWork(item));
    return works.filter((work): work is ImageGalleryWork => work !== null);
  }

  invalidate(path?: string): void {
    if (path) this.cache.delete(path);
    else this.cache.clear();
  }

  private async readWork(item: MediaItem): Promise<ImageGalleryWork | null> {
    const file = this.host.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
      this.cache.delete(item.filePath);
      return null;
    }
    const cached = this.cache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.work;
    const markdown = await this.host.app.vault.cachedRead(file);
    const work = buildImageGalleryWork(item, markdown);
    this.cache.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, work });
    return work;
  }
}

const SERVICES = new WeakMap<object, ImageGalleryService>();

export function imageGalleryServiceForHost(host: ImageGalleryHost): ImageGalleryService {
  const key = host as object;
  let service = SERVICES.get(key);
  if (!service) {
    service = new ImageGalleryService(host);
    SERVICES.set(key, service);
  }
  return service;
}

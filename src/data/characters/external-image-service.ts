import { Platform } from "obsidian";
import { externalImageUri, localPathFromImageUri } from "../../domain/characters/external-image";

const MAX_BYTES = 40 * 1024 * 1024;
interface FsLike {
  promises: {
    stat(path: string): Promise<{ size: number; isFile(): boolean }>;
    readFile(path: string): Promise<Uint8Array>;
  };
}
function desktopFilesystem(): FsLike {
  if (!Platform.isDesktopApp) throw new Error("External image references are only available on Desktop");
  const bridge = window as Window & { require?: (name: string) => unknown };
  if (typeof bridge.require !== "function") throw new Error("Desktop filesystem bridge is unavailable");
  const value = bridge.require("fs") as FsLike | null;
  if (!value?.promises?.readFile || !value.promises.stat) throw new Error("Desktop filesystem is unavailable");
  return value;
}

/** Strictly opt-in local file access. Never sends local paths or bytes to a network provider. */
export class ExternalImageService {
  private readonly cached = new Map<string, { resource: string; accessed: number }>();
  private readonly pending = new Map<string, Promise<string>>();
  private tick = 0;
  get(uri: string): string { return this.cached.get(uri)?.resource ?? ""; }
  async prepare(input: string): Promise<string> {
    const uri = externalImageUri(input);
    const already = this.cached.get(uri);
    if (already) { already.accessed = ++this.tick; return already.resource; }
    const ongoing = this.pending.get(uri);
    if (ongoing) return ongoing;
    const work = this.load(uri).finally(() => this.pending.delete(uri));
    this.pending.set(uri, work);
    return work;
  }
  private async load(uri: string): Promise<string> {
    const fs = desktopFilesystem();
    const path = localPathFromImageUri(uri);
    const stat = await fs.promises.stat(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) {
      throw new Error("External image is empty, unavailable, or exceeds 40 MB");
    }
    const bytes = await fs.promises.readFile(path);
    if (bytes.byteLength > MAX_BYTES) throw new Error("External image exceeds 40 MB");
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif" : ext === "avif" ? "image/avif" : "image/jpeg";
    const resource = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
    this.cached.set(uri, { resource, accessed: ++this.tick });
    while (this.cached.size > 64) {
      const oldest = [...this.cached.entries()].sort((a, b) => a[1].accessed - b[1].accessed)[0];
      URL.revokeObjectURL(oldest[1].resource);
      this.cached.delete(oldest[0]);
    }
    return resource;
  }
  async read(input: string): Promise<ArrayBuffer> {
    const uri = externalImageUri(input);
    const fs = desktopFilesystem();
    const path = localPathFromImageUri(uri);
    const stat = await fs.promises.stat(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) throw new Error("External image unavailable or too large");
    const bytes = await fs.promises.readFile(path);
    const copy = new Uint8Array(bytes);
    return copy.buffer;
  }
  dispose(): void {
    this.pending.clear();
    for (const item of this.cached.values()) URL.revokeObjectURL(item.resource);
    this.cached.clear();
  }
}
const instances = new WeakMap<object, ExternalImageService>();
export function externalImagesForHost(host: object): ExternalImageService {
  let service = instances.get(host);
  if (!service) { service = new ExternalImageService(); instances.set(host, service); }
  return service;
}

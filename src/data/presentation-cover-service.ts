import { TFile, requestUrl } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import { normalizedCoverPath } from "../domain/value-normalization";

export interface PresentationCoverAsset {
  data: ArrayBuffer;
  contentType: string;
}

export type PresentationCoverReference =
  | { kind: "file"; path: string }
  | { kind: "remote"; url: string };

/**
 * The library's MediaItem.cover is a display URL (often app://...), NOT the
 * source Vault path. Recover the original cover from the owning Markdown note.
 * This also lets us fall back to remote covers when no local file exists.
 */
export function presentationCoverCandidates(
  originalCover: unknown,
  remoteCover: unknown,
  renderedCover: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of [originalCover, remoteCover, renderedCover]) {
    const reference = normalizedCoverPath(input).trim();
    if (!reference || /^(?:app|blob|data):/i.test(reference) || seen.has(reference)) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference) && !/^https?:\/\//i.test(reference)) continue;
    seen.add(reference);
    result.push(reference);
  }
  return result;
}

function fileMime(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

export function resolvePresentationCoverSources(
  host: AnimeListFeatureHost,
  item: MediaItem,
): PresentationCoverReference[] {
  const note = host.app.vault.getAbstractFileByPath(item.filePath);
  const fm = note instanceof TFile ? host.app.metadataCache.getFileCache(note)?.frontmatter : undefined;
  return presentationCoverCandidates(fm?.cover, fm?.cover_remote, item.cover).flatMap((reference): PresentationCoverReference[] => {
    if (/^https?:\/\//i.test(reference)) return [{ kind: "remote" as const, url: reference }];
    const file = host.app.metadataCache.getFirstLinkpathDest(reference, item.filePath)
      ?? host.app.vault.getAbstractFileByPath(reference);
    return file instanceof TFile ? [{ kind: "file" as const, path: file.path }] : [];
  });
}

async function remoteCover(url: string): Promise<PresentationCoverAsset> {
  const response = await requestUrl({ url, method: "GET", throw: false });
  if (response.status < 200 || response.status >= 300) throw new Error("Remote cover is unavailable");
  const contentType = Object.entries(response.headers)
    .find(([key]) => key.toLowerCase() === "content-type")?.[1]?.split(";")[0] ?? "application/octet-stream";
  return { data: response.arrayBuffer, contentType };
}

/** Resolve one image at a time; no persistent full-size bitmap or file cache. */
export async function readPresentationCover(
  host: AnimeListFeatureHost,
  item: MediaItem,
): Promise<PresentationCoverAsset | null> {
  for (const source of resolvePresentationCoverSources(host, item)) {
    try {
      if (source.kind === "file") {
        const file = host.app.vault.getAbstractFileByPath(source.path);
        if (!(file instanceof TFile)) continue;
        return { data: await host.app.vault.readBinary(file), contentType: fileMime(file.path) };
      }
      return await remoteCover(source.url);
    } catch {
      // Try the next source (for example local artwork, followed by cover_remote).
    }
  }
  return null;
}

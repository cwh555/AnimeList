import { compareChapterLabels, latestPrimaryMangaChapter } from "./release-tracking";

export type OfficialMangaReleaseSourceId = "comic-days" | "viz" | "kadocomi" | "champion-cross";

export interface AniListMangaExternalLink {
  site: string;
  url: string;
  type: string;
  language: string;
}

export interface OfficialMangaReleaseSource {
  id: OfficialMangaReleaseSourceId;
  label: string;
  url: string;
}

export interface MangaChapterEvidence {
  latest: string;
  sourceLabel: string;
  sourceUrl: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function sourceFromUrl(urlValue: string): Pick<OfficialMangaReleaseSource, "id" | "label"> | null {
  try {
    const url = new URL(urlValue);
    const host = url.hostname.toLocaleLowerCase();
    if (host === "comic-days.com" || host === "www.comic-days.com") {
      return { id: "comic-days", label: "Comic DAYS" };
    }
    if ((host === "viz.com" || host === "www.viz.com") && /\/chapters\//i.test(url.pathname)) {
      return { id: "viz", label: "VIZ" };
    }
    if (host === "comic-walker.com" || host === "www.comic-walker.com") {
      return { id: "kadocomi", label: "Kadocomi" };
    }
    if (host === "championcross.jp" || host === "www.championcross.jp") {
      return { id: "champion-cross", label: "Champion Cross" };
    }
  } catch {
    return null;
  }
  return null;
}

export function officialMangaReleaseSource(link: AniListMangaExternalLink): OfficialMangaReleaseSource | null {
  const url = stringValue(link.url);
  if (!url || stringValue(link.type).toLocaleUpperCase() !== "STREAMING") return null;
  const source = sourceFromUrl(url);
  return source ? { ...source, url } : null;
}

export function officialMangaReleaseSources(links: readonly AniListMangaExternalLink[]): OfficialMangaReleaseSource[] {
  const byKey = new Map<string, OfficialMangaReleaseSource>();
  for (const link of links) {
    const source = officialMangaReleaseSource(link);
    if (!source) continue;
    byKey.set(`${source.id}\u0000${source.url}`, source);
  }
  return [...byKey.values()];
}

export function normalizedMangaChapterEvidence(
  labels: readonly unknown[],
  sourceLabel: string,
  sourceUrl: string,
): MangaChapterEvidence | null {
  const latest = latestPrimaryMangaChapter([...labels]);
  return latest ? { latest, sourceLabel, sourceUrl } : null;
}

export function latestMangaChapterEvidence(evidence: readonly MangaChapterEvidence[]): MangaChapterEvidence | null {
  let latest: MangaChapterEvidence | null = null;
  for (const candidate of evidence) {
    if (!candidate.latest) continue;
    if (!latest || compareChapterLabels(candidate.latest, latest.latest) > 0) latest = candidate;
  }
  return latest;
}

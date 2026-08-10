import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import {
  normalizedMangaChapterEvidence,
  type MangaChapterEvidence,
  type OfficialMangaReleaseSource,
} from "../../domain/manga-release-sources";
import { normalizeTrackingText } from "../../domain/release-tracking";

const COMIC_DAYS_SEARCH = "https://comic-days.com/search";

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function attribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]).trim() : "";
}

function chapterLabels(html: string): string[] {
  const labels = new Set<string>();
  const patterns = [
    /(?:〖?第)\s*(\d+(?:\.\d+)?)\s*話/giu,
    /(?:chapter|ch\.)\s*#?\s*(\d+(?:\.\d+)?)/giu,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) labels.add(match[1]);
  }
  return [...labels];
}

export function parseOfficialMangaChapterHtml(
  source: OfficialMangaReleaseSource,
  html: string,
  sourceUrl = source.url,
): MangaChapterEvidence | null {
  return normalizedMangaChapterEvidence(chapterLabels(html), source.label, sourceUrl);
}

export function comicDaysLatestEpisodeUrl(searchHtml: string, expectedTitles: readonly string[]): string {
  const expected = new Set(expectedTitles.map(normalizeTrackingText).filter(Boolean));
  const cardPattern = /<li\b([^>]*\bdata-title\s*=\s*(["'])(.*?)\2[^>]*)>([\s\S]*?)<\/li>/gi;
  let card: RegExpExecArray | null;
  while ((card = cardPattern.exec(searchHtml)) !== null) {
    if (!expected.has(normalizeTrackingText(decodeHtml(card[3])))) continue;
    const body = card[4];
    const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let link: RegExpExecArray | null;
    while ((link = linkPattern.exec(body)) !== null) {
      const classes = attribute(link[1], "class").split(/\s+/);
      if (!classes.includes("sub-link") || stripTags(link[2]) !== "最新話を読む") continue;
      const href = attribute(link[1], "href");
      if (!href) continue;
      try {
        const url = new URL(href, COMIC_DAYS_SEARCH);
        if (url.hostname === "comic-days.com" || url.hostname === "www.comic-days.com") return url.href;
      } catch {
        continue;
      }
    }
  }
  return "";
}

export class OfficialMangaReleaseClient {
  private async get(url: string): Promise<string> {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": USER_AGENT },
    });
    return response.text || "";
  }

  private async comicDays(source: OfficialMangaReleaseSource, titles: readonly string[]): Promise<MangaChapterEvidence | null> {
    for (const titleValue of titles) {
      const title = titleValue.trim();
      if (!title) continue;
      const searchUrl = `${COMIC_DAYS_SEARCH}?${new URLSearchParams({ q: title }).toString()}`;
      const searchHtml = await this.get(searchUrl);
      const latestUrl = comicDaysLatestEpisodeUrl(searchHtml, [title]);
      if (!latestUrl) continue;
      const evidence = parseOfficialMangaChapterHtml(source, await this.get(latestUrl), latestUrl);
      if (evidence) return evidence;
    }
    return null;
  }

  async latestChapter(
    source: OfficialMangaReleaseSource,
    titles: readonly string[],
  ): Promise<MangaChapterEvidence | null> {
    if (source.id === "comic-days") return await this.comicDays(source, titles);
    return parseOfficialMangaChapterHtml(source, await this.get(source.url), source.url);
  }
}

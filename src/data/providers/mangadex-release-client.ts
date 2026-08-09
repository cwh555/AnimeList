import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import { latestPrimaryMangaChapter } from "../../domain/release-tracking";

const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_WEB = "https://mangadex.org/title";

export interface MangaDexSeriesCandidate {
  id: string;
  title: string;
  altTitles: string[];
  sourceUrl: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function localizedValues(value: unknown): string[] {
  const source = record(value);
  return Object.values(source).map(stringValue).filter(Boolean);
}

function candidateFromEntity(value: unknown): MangaDexSeriesCandidate | null {
  const entity = record(value);
  const id = stringValue(entity.id);
  const attributes = record(entity.attributes);
  if (!id) return null;
  const titles = localizedValues(attributes.title);
  const altTitles = array(attributes.altTitles).flatMap((entry) => localizedValues(entry));
  return {
    id,
    title: titles[0] ?? altTitles[0] ?? id,
    altTitles: [...new Set([...titles.slice(1), ...altTitles])],
    sourceUrl: `${MANGADEX_WEB}/${encodeURIComponent(id)}`,
  };
}

export class MangaDexReleaseClient {
  async search(query: string): Promise<MangaDexSeriesCandidate[]> {
    const title = query.trim();
    if (!title) return [];
    const parameters = new URLSearchParams({ title, limit: "10" });
    const response = await requestUrl({
      url: `${MANGADEX_API}/manga?${parameters.toString()}`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    return array(payload.data)
      .map(candidateFromEntity)
      .filter((candidate): candidate is MangaDexSeriesCandidate => candidate !== null);
  }

  async latestChapter(sourceId: string, now = new Date()): Promise<string> {
    const id = sourceId.trim();
    if (!id) return "";
    const parameters = new URLSearchParams({
      limit: "100",
      "order[chapter]": "desc",
    });
    const response = await requestUrl({
      url: `${MANGADEX_API}/manga/${encodeURIComponent(id)}/feed?${parameters.toString()}`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const payload = record(response.json ?? JSON.parse(response.text || "{}"));
    const nowTimestamp = now.getTime();
    const labels = array(payload.data).flatMap((value) => {
      const attributes = record(record(value).attributes);
      const chapter = stringValue(attributes.chapter);
      const publishedAt = stringValue(attributes.publishAt || attributes.readableAt || attributes.createdAt);
      if (publishedAt) {
        const timestamp = Date.parse(publishedAt);
        if (Number.isFinite(timestamp) && timestamp > nowTimestamp) return [];
      }
      return chapter ? [chapter] : [];
    });
    return latestPrimaryMangaChapter(labels);
  }
}

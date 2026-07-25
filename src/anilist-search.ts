import { requestAniListGraphQL } from "./anilist-client";
import { attachAniListGenres } from "./media-classification";
import { releaseDateMetadata } from "./release-season";
import type { ExternalMediaResult, MediaType, ReleaseStatus } from "./types";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const QUERY = `
  query ($search: String, $type: MediaType, $format: MediaFormat) {
    Page(page: 1, perPage: 20) {
      media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
        id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
        tags { id name category rank isAdult isGeneralSpoiler isMediaSpoiler }
        startDate { year month day }
        title { romaji english native }
        coverImage { extraLarge large medium }
        studios(isMain: true) { nodes { name } }
        staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
      }
    }
  }
`;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringList(value: unknown): string[] {
  return asArray(value).map(stringValue).filter(Boolean);
}

function stripHtml(value: unknown): string {
  return stringValue(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function mediaFormat(value: unknown, mediaType: MediaType): string {
  const format = stringValue(value).toUpperCase();
  const formats: Record<string, string> = {
    TV: "tv", TV_SHORT: "tv", MOVIE: "movie", OVA: "ova", ONA: "ona",
    SPECIAL: "special", MUSIC: "music", MANGA: "manga", ONE_SHOT: "one_shot", NOVEL: "light_novel",
  };
  return formats[format] ?? (mediaType === "anime" ? "tv" : mediaType === "manga" ? "manga" : "light_novel");
}

function releaseStatus(value: unknown): ReleaseStatus {
  const statuses: Record<string, ReleaseStatus> = {
    RELEASING: "releasing",
    FINISHED: "finished",
    HIATUS: "hiatus",
    CANCELLED: "cancelled",
  };
  return statuses[stringValue(value).toUpperCase()] ?? "unknown";
}

export function normalizeAniListSearchMedia(value: unknown, mediaType: MediaType): ExternalMediaResult {
  const media = recordValue(value);
  const title = recordValue(media.title);
  const cover = recordValue(media.coverImage);
  const startDate = recordValue(media.startDate);
  const studios = recordValue(media.studios);
  const staff = recordValue(media.staff);
  const english = stringValue(title.english);
  const romaji = stringValue(title.romaji);
  const native = stringValue(title.native);
  const displayTitle = english || romaji || native || "Untitled";
  const people = mediaType === "anime"
    ? asArray(studios.nodes).map((node) => stringValue(recordValue(node).name)).filter(Boolean)
    : asArray(staff.edges).flatMap((edge) => {
      const record = recordValue(edge);
      if (!/creator|story|art|author|original/i.test(stringValue(record.role))) return [];
      const name = recordValue(recordValue(record.node).name);
      const person = stringValue(name.native) || stringValue(name.full);
      return person ? [person] : [];
    });
  const rawGenres = stringList(media.genres).slice(0, 12);
  const tags = asArray(media.tags).map(recordValue);
  const release = releaseDateMetadata(startDate.year, startDate.month);
  const sourceId = String(numberValue(media.id));
  const total = mediaType === "anime" ? numberValue(media.episodes) : 0;
  const score = media.averageScore == null ? null : numberValue(media.averageScore) / 10;
  const siteUrl = stringValue(media.siteUrl)
    || (sourceId !== "0" ? `https://anilist.co/${mediaType === "anime" ? "anime" : "manga"}/${sourceId}` : "");
  const searchTitles = [...new Set([
    displayTitle,
    native,
    romaji,
    english,
    ...stringList(media.synonyms),
  ].filter(Boolean))];
  return {
    provider: "anilist",
    sourceId: sourceId === "0" ? "" : sourceId,
    title: displayTitle,
    originalTitle: native || romaji,
    romajiTitle: romaji,
    mediaType,
    format: mediaFormat(media.format, mediaType),
    total,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    year: release.year,
    season: release.season,
    genres: attachAniListGenres(rawGenres, tags),
    tags: [],
    rawGenres,
    rawTags: [],
    people,
    platforms: [],
    sourceUrl: siteUrl,
    coverUrl: stringValue(cover.extraLarge) || stringValue(cover.large) || stringValue(cover.medium),
    summary: stripHtml(media.description),
    externalScore: score,
    releaseStatus: releaseStatus(media.status),
    searchTitles,
  };
}

export async function searchAniListCanonical(
  mediaType: MediaType,
  query: string,
): Promise<ExternalMediaResult[]> {
  const variables = {
    search: query,
    type: mediaType === "anime" ? "ANIME" : "MANGA",
    format: mediaType === "novel" ? "NOVEL" : null,
  };
  const payload = await requestAniListGraphQL<{ Page?: { media?: unknown[] | null } | null }>(
    QUERY,
    variables,
    USER_AGENT,
    { cacheKey: `search:${mediaType}:${query.normalize("NFKC").trim().toLocaleLowerCase()}` },
  );
  let media = asArray(payload.Page?.media);
  if (mediaType === "manga") {
    media = media.filter((item) => stringValue(recordValue(item).format).toUpperCase() !== "NOVEL");
  }
  return media.map((item) => normalizeAniListSearchMedia(item, mediaType));
}

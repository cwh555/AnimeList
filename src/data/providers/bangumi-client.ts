import { requestUrl } from "obsidian";
import { withProviderRequestDeadline } from "./request-deadline";
import { USER_AGENT } from "../../app-metadata";
import type { MediaType } from "../../domain/media-types";
import { asArray, stringValue } from "../../domain/value-normalization";
import { bangumiBookMediaType } from "../../domain/bangumi-book-type";
import type { MetadataProviderClient, MetadataProviderPage } from "../external-media-provider";
import { normalizeBangumiAnimationStudiosFromPersons, normalizeBangumiSubject } from "../provider-normalizers";

const BANGUMI_SEARCH_ENDPOINT = "https://api.bgm.tv/v0/search/subjects";
const BANGUMI_SUBJECT_ENDPOINT = "https://api.bgm.tv/v0/subjects";
const BANGUMI_SUBJECT_PERSONS_SUFFIX = "/persons";
const BANGUMI_PAGE_SIZE = 20;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** An unknown Book subtype remains a candidate; a known opposite subtype does not. */
function matchesBookMediaType(subject: Record<string, unknown>, requested: MediaType): boolean {
  if (requested === "anime") return true;
  const tags = asArray(subject.meta_tags).map(value => stringValue(value));
  const keys = asArray(subject.infobox).map(value => stringValue(record(value).key));
  const inferred = bangumiBookMediaType(stringValue(subject.platform), tags, keys);
  return inferred === null || inferred === requested;
}

export class BangumiClient implements MetadataProviderClient {
  readonly id = "bangumi" as const;
  readonly label = "Bangumi";
  readonly supportsChineseDiscovery = true;

  supports(_mediaType: MediaType): boolean { return true; }



  /** Only the subject detail endpoint is needed for title normalization. */
  async fetchTitleById(mediaType: MediaType, sourceId: string): Promise<ReturnType<typeof normalizeBangumiSubject> | null> {
    const id = sourceId.trim();
    if (!/^\d+$/.test(id)) return null;
    const response = await withProviderRequestDeadline("Bangumi", () => requestUrl({
      url: BANGUMI_SUBJECT_ENDPOINT + "/" + encodeURIComponent(id),
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    }));
    const subject = record(response.json ?? JSON.parse(response.text || "{}"));
    return Object.keys(subject).length && matchesBookMediaType(subject, mediaType)
      ? normalizeBangumiSubject(subject, mediaType) : null;
  }

  async fetchById(mediaType: MediaType, sourceId: string): Promise<ReturnType<typeof normalizeBangumiSubject> | null> {
    const id = sourceId.trim();
    if (!id) return null;
    const response = await withProviderRequestDeadline("Bangumi", () => requestUrl({
      url: `${BANGUMI_SUBJECT_ENDPOINT}/${encodeURIComponent(id)}`,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    }));
    const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
    const subject = record(parsed);
    if (!Object.keys(subject).length) return null;

    if (!matchesBookMediaType(subject, mediaType)) return null;
    const normalized = normalizeBangumiSubject(subject, mediaType);
    if (mediaType !== "anime" || normalized.people.length) return normalized;

    try {
      const personsResponse = await withProviderRequestDeadline("Bangumi", () => requestUrl({
        url: `${BANGUMI_SUBJECT_ENDPOINT}/${encodeURIComponent(id)}${BANGUMI_SUBJECT_PERSONS_SUFFIX}`,
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      }));
      const persons: unknown = personsResponse.json ?? JSON.parse(personsResponse.text || "[]");
      const studios = normalizeBangumiAnimationStudiosFromPersons(persons);
      return studios.length ? { ...normalized, people: studios } : normalized;
    } catch {
      // The relation endpoint is a reliability fallback. Preserve the exact
      // subject result if it is temporarily unavailable; AniList enrichment
      // remains an independent secondary source.
      return normalized;
    }
  }

  async searchPage(mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage> {
    const normalizedPage = Math.max(1, Math.floor(page));
    const offset = (normalizedPage - 1) * BANGUMI_PAGE_SIZE;
    const response = await withProviderRequestDeadline("Bangumi", () => requestUrl({
      url: `${BANGUMI_SEARCH_ENDPOINT}?limit=${BANGUMI_PAGE_SIZE}&offset=${offset}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        keyword: query,
        sort: "match",
        filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false },
      }),
    }));
    const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
    const payload = record(parsed);
    const subjects = asArray(payload.data);
    const total = optionalNumber(payload.total);
    return {
      results: subjects.filter(subject => matchesBookMediaType(record(subject), mediaType))
        .map((subject) => normalizeBangumiSubject(subject, mediaType)),
      hasMore: total === null
        ? subjects.length === BANGUMI_PAGE_SIZE
        : offset + subjects.length < total,
    };
  }
}

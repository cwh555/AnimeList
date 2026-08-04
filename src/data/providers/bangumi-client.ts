import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { MediaType } from "../../domain/media-types";
import { asArray } from "../../domain/value-normalization";
import type { MetadataProviderClient, MetadataProviderPage } from "../external-media-provider";
import { normalizeBangumiSubject } from "../provider-normalizers";

const BANGUMI_SEARCH_ENDPOINT = "https://api.bgm.tv/v0/search/subjects";
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

export class BangumiClient implements MetadataProviderClient {
  readonly id = "bangumi" as const;
  readonly label = "Bangumi";
  readonly supportsChineseDiscovery = true;

  supports(_mediaType: MediaType): boolean { return true; }

  async searchPage(mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage> {
    const normalizedPage = Math.max(1, Math.floor(page));
    const offset = (normalizedPage - 1) * BANGUMI_PAGE_SIZE;
    const response = await requestUrl({
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
    });
    const parsed: unknown = response.json ?? JSON.parse(response.text || "{}");
    const payload = record(parsed);
    const subjects = asArray(payload.data);
    const total = optionalNumber(payload.total);
    return {
      results: subjects.map((subject) => normalizeBangumiSubject(subject, mediaType)),
      hasMore: total === null
        ? subjects.length === BANGUMI_PAGE_SIZE
        : offset + subjects.length < total,
    };
  }
}

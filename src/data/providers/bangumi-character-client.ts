import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import { withProviderRequestDeadline } from "./request-deadline";
import type { CharacterCandidate } from "../../domain/characters/character";

const ROOT = "https://api.bgm.tv/v0";
const headers = { Accept: "application/json", "User-Agent": USER_AGENT };

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export function bangumiCharacterCandidate(value: unknown, appearance?: string): CharacterCandidate | null {
  const raw = object(value);
  const id = Number(raw.id);
  const name = text(raw.name);
  if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;
  const images = object(raw.images);
  const portrait = [images.large, images.medium, images.grid, images.small]
    .map(text).find(url => /^https:\/\//i.test(url)) ?? "";
  return {
    name,
    bangumiId: String(id),
    portrait,
    appearance,
    relation: text(raw.relation),
  };
}

export class BangumiCharacterClient {
  async fromSubject(subjectId: string, appearance: string): Promise<CharacterCandidate[]> {
    if (!/^[1-9]\d*$/.test(subjectId)) throw new Error("Invalid Bangumi subject ID");
    const response = await withProviderRequestDeadline("Bangumi characters", () => requestUrl({
      url: ROOT + "/subjects/" + encodeURIComponent(subjectId) + "/characters",
      headers,
    }));
    const entries: unknown = response.json ?? JSON.parse(response.text || "[]");
    if (!Array.isArray(entries)) throw new Error("Invalid Bangumi character response");
    return entries.map(value => bangumiCharacterCandidate(value, appearance))
      .filter((value): value is CharacterCandidate => value !== null);
  }

  async search(query: string): Promise<CharacterCandidate[]> {
    const keyword = query.trim();
    if (!keyword) return [];
    const response = await withProviderRequestDeadline("Bangumi character search", () => requestUrl({
      url: ROOT + "/search/characters?limit=20&offset=0",
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, filter: { nsfw: false } }),
    }));
    const payload = object(response.json ?? JSON.parse(response.text || "{}"));
    if (!Array.isArray(payload.data)) throw new Error("Invalid Bangumi character search response");
    return payload.data.map(value => bangumiCharacterCandidate(value))
      .filter((value): value is CharacterCandidate => value !== null);
  }
}

import { requestUrl } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import { convertChineseScriptForReview } from "../domain/chinese-title-conversion";
import type { ExternalMediaResult, WikidataTitleEvidence } from "../domain/media-types";
import type { SupportedLocale } from "../i18n/locale";

const PROPERTY = {
  bangumi: () => "P5732",
  anilist: (result: ExternalMediaResult) => result.mediaType === "anime" ? "P8729" : "P8731",
} as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function labeled(data: Record<string, unknown>, locale: string): string {
  return string(object(data[locale]).value);
}
function titleForLocale(entity: Record<string, unknown>, locale: SupportedLocale):
  { title: string; kind: WikidataTitleEvidence["kind"] } | null {
  const labels = object(entity.labels);
  if (locale === "zh-TW" || locale === "zh-CN") {
    const candidates = locale === "zh-TW"
      ? ["zh-tw", "zh-hant"] : ["zh-cn", "zh-hans"];
    for (const language of candidates) {
      const value = labeled(labels, language);
      if (value) return { title: value, kind: "wikidata-label" };
    }
    // Wikidata's Chinese Wikipedia sitelink is language-neutral. It may contain
    // Simplified or Traditional text and is never represented as an official title.
    const site = string(object(object(entity.sitelinks).zhwiki).title);
    const other = locale === "zh-TW" ? ["zh-hans", "zh-cn"] : ["zh-hant", "zh-tw"];
    const fallback = site || labeled(labels, "zh") || other.map(lang => labeled(labels, lang)).find(Boolean) || "";
    const title = fallback ? convertChineseScriptForReview(fallback, locale) ?? fallback : "";
    return title ? { title, kind: "script-conversion" } : null;
  }
  const label = labeled(labels, locale);
  if (label) return { title: label, kind: "wikidata-label" };
  const siteName = ({ en: "enwiki", ja: "jawiki", ko: "kowiki" } as const)[locale];
  const title = string(object(object(entity.sitelinks)[siteName]).title);
  return title ? { title, kind: "wikipedia-title" } : null;
}
export function parseWikidataTitleEvidence(
  queryResult: unknown, entityResult: unknown, result: ExternalMediaResult, locale: SupportedLocale,
): WikidataTitleEvidence | null {
  const property = result.provider === "bangumi" ? PROPERTY.bangumi()
    : result.provider === "anilist" ? PROPERTY.anilist(result) : null;
  if (!property || !/^\d+$/.test(result.sourceId)) return null;
  const bindings = object(object(queryResult).results).bindings;
  if (!Array.isArray(bindings) || bindings.length !== 1) return null;
  const url = string(object(object(bindings[0]).item).value);
  const match = /^https:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(url);
  if (!match) return null;
  const itemId = match[1];
  const entity = object(object(entityResult).entities)[itemId];
  const name = titleForLocale(object(entity), locale);
  return name ? { ...name, locale, itemId, identityProperty: property } : null;
}

/** Exact ID lookup only. Never infer a QID from the first text-search result. */
export class WikidataTitleService {
  private readonly pending = new Map<string, Promise<WikidataTitleEvidence | null>>();
  private readonly cache = new Map<string, WikidataTitleEvidence | null>();
  constructor(
    private readonly request: (url: string) => Promise<unknown> = async url =>
      (await requestUrl({ url, headers: {
        Accept: "application/json", "User-Agent": USER_AGENT,
      } } )).json,
  ) {}

  lookup(result: ExternalMediaResult, locale: SupportedLocale): Promise<WikidataTitleEvidence | null> {
    const property = result.provider === "bangumi" ? PROPERTY.bangumi()
      : result.provider === "anilist" ? PROPERTY.anilist(result) : null;
    if (!property || !/^\d+$/.test(result.sourceId)) return Promise.resolve(null);
    const key = `${property}:${result.sourceId}:${locale}`;
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key) ?? null);
    const existing = this.pending.get(key);
    if (existing !== undefined) return existing;
    const work = this.lookupExact(result, locale, property).then(evidence => {
      this.cache.set(key, evidence);
      return evidence;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, work);
    return work;
  }

  private async lookupExact(result: ExternalMediaResult, locale: SupportedLocale,
    property: string): Promise<WikidataTitleEvidence | null> {
    const query = `SELECT DISTINCT ?item WHERE { ?item wdt:${property} "${result.sourceId}". } LIMIT 2`;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
    const matches = await this.request(url);
    const bindings = object(object(matches).results).bindings;
    if (!Array.isArray(bindings) || bindings.length !== 1) return null;
    const itemUrl = string(object(object(bindings[0]).item).value);
    const id = /^https:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(itemUrl)?.[1];
    if (!id) return null;
    const langs = ["zh-tw", "zh-hant", "zh-cn", "zh-hans", "zh", "en", "ja", "ko"].join("|");
    const entityUrl = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids="
      + encodeURIComponent(id) + "&props=labels%7Csitelinks&languages="
      + encodeURIComponent(langs) + "&format=json";
    return parseWikidataTitleEvidence(matches, await this.request(entityUrl), result, locale);
  }
}

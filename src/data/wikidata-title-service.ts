import { requestUrl } from "obsidian";
import { USER_AGENT } from "../app-metadata";
import { convertChineseScriptForReview } from "../domain/chinese-title-conversion";
import type { ExternalMediaResult, WikidataTitleEvidence } from "../domain/media-types";
import type { SupportedLocale } from "../i18n/locale";

type TitleIdentity = Pick<ExternalMediaResult, "provider" | "sourceId" | "mediaType">;
/** Externally stable work identifiers only, never author or edition records. */
function identityProperty(result: TitleIdentity): string | null {
  if (result.provider === "bangumi" && /^[1-9]\d*$/.test(result.sourceId)) return "P5732";
  if (result.provider === "anilist" && /^[1-9]\d*$/.test(result.sourceId)) {
    return result.mediaType === "anime" ? "P8729" : "P8731";
  }
  if (result.provider === "openlibrary" && /^OL[1-9]\d*W$/.test(result.sourceId)) return "P648";
  return null;
}

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
  queryResult: unknown, entityResult: unknown, result: TitleIdentity, locale: SupportedLocale,
): WikidataTitleEvidence | null {
  const property = identityProperty(result);
    if (!property) return null;
  const bindings = object(object(queryResult).results).bindings;
  if (!Array.isArray(bindings) || bindings.length !== 1) return null;
  const url = string(object(object(bindings[0]).item).value);
  const match = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(url);
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
  private unavailableUntil = 0;
  constructor(
    private readonly request: (url: string) => Promise<unknown> = async url =>
      (await requestUrl({ url, headers: {
        Accept: "application/json", "User-Agent": USER_AGENT,
      } } )).json,
  ) {}

  private async requestWithTimeout(url: string): Promise<unknown> {
    let timer: number | undefined;
    try {
      return await Promise.race([
        this.request(url),
        new Promise<never>((_resolve, reject) => {
          timer = window.setTimeout(() => reject(new Error("Wikidata title lookup timed out")), 5_000);
        }),
      ]);
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  }

  lookup(result: TitleIdentity, locale: SupportedLocale): Promise<WikidataTitleEvidence | null> {
    const property = identityProperty(result);
    if (!property) return Promise.resolve(null);
    const key = `${property}:${result.sourceId}:${locale}`;
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key) ?? null);
    if (Date.now() < this.unavailableUntil) return Promise.resolve(null);
    const existing = this.pending.get(key);
    if (existing !== undefined) return existing;
    const work = this.lookupExact(result, locale, property).then(evidence => {
      this.cache.set(key, evidence);
      if (this.cache.size > 256) {
        const oldest: string | undefined = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      return evidence;
    }).catch((error: unknown) => {
      this.unavailableUntil = Date.now() + 60_000;
      throw error;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, work);
    return work;
  }

  private async lookupExact(result: TitleIdentity, locale: SupportedLocale,
    property: string): Promise<WikidataTitleEvidence | null> {
    const query = `SELECT DISTINCT ?item WHERE { ?item wdt:${property} "${result.sourceId}". } LIMIT 2`;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
    const matches = await this.requestWithTimeout(url);
    const bindings = object(object(matches).results).bindings;
    if (!Array.isArray(bindings) || bindings.length !== 1) return null;
    const itemUrl = string(object(object(bindings[0]).item).value);
    const id = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(itemUrl)?.[1];
    if (!id) return null;
    const langs = ["zh-tw", "zh-hant", "zh-cn", "zh-hans", "zh", "en", "ja", "ko"].join("|");
    const entityUrl = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids="
      + encodeURIComponent(id) + "&props=labels%7Csitelinks&languages="
      + encodeURIComponent(langs) + "&format=json";
    return parseWikidataTitleEvidence(matches, await this.requestWithTimeout(entityUrl), result, locale);
  }
}

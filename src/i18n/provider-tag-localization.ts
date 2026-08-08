import { normalizeGenre } from "../domain/media-metadata";
import type { ExternalMediaResult, MediaItem, MediaNoteForm } from "../domain/media-types";
import type { MediaClassification } from "../domain/media-classification";
import { getActiveLocale } from "./catalog";
import type { SupportedLocale } from "./locale";
import { EN_PROVIDER_TAG_LABELS } from "./locales/en/provider-tags";
import { JA_PROVIDER_TAG_LABELS } from "./locales/ja/provider-tags";
import { KO_PROVIDER_TAG_LABELS } from "./locales/ko/provider-tags";
import {
  ZH_TW_PROVIDER_TAG_LABELS,
  type ProviderTagCanonical,
} from "./locales/zh-TW/provider-tags";

const PROVIDER_TAG_LABELS = {
  "zh-TW": ZH_TW_PROVIDER_TAG_LABELS,
  en: EN_PROVIDER_TAG_LABELS,
  ja: JA_PROVIDER_TAG_LABELS,
  ko: KO_PROVIDER_TAG_LABELS,
} as const satisfies Record<SupportedLocale, Record<ProviderTagCanonical, string>>;

const LABEL_TO_CANONICAL = new Map<string, ProviderTagCanonical>();

function tagKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

for (const canonical of Object.keys(ZH_TW_PROVIDER_TAG_LABELS) as ProviderTagCanonical[]) {
  LABEL_TO_CANONICAL.set(tagKey(canonical), canonical);
  for (const locale of Object.keys(PROVIDER_TAG_LABELS) as SupportedLocale[]) {
    LABEL_TO_CANONICAL.set(tagKey(PROVIDER_TAG_LABELS[locale][canonical]), canonical);
  }
}

function resolvedLocale(locale: string = getActiveLocale()): SupportedLocale {
  return locale === "en" || locale === "ja" || locale === "ko" ? locale : "zh-TW";
}

function canonicalProviderTag(value: unknown): ProviderTagCanonical | null {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFKC").trim();
  if (!clean) return null;
  const knownLabel = LABEL_TO_CANONICAL.get(tagKey(clean));
  if (knownLabel) return knownLabel;
  const normalized = normalizeGenre(clean);
  return Object.hasOwn(ZH_TW_PROVIDER_TAG_LABELS, normalized)
    ? normalized as ProviderTagCanonical
    : null;
}

export function localizeProviderTag(value: unknown, locale?: string): string {
  if (typeof value !== "string") return "";
  const clean = value.normalize("NFKC").trim();
  if (!clean) return "";
  const canonical = canonicalProviderTag(clean);
  return canonical ? PROVIDER_TAG_LABELS[resolvedLocale(locale)][canonical] : clean;
}

export function localizeProviderTags(values: readonly string[] | undefined, locale?: string): string[] {
  if (!values?.length) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const localized = localizeProviderTag(value, locale);
    if (!localized || seen.has(localized)) continue;
    seen.add(localized);
    output.push(localized);
  }
  return output;
}

export function canonicalizeProviderTags(values: readonly string[] | undefined): string[] {
  if (!values?.length) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = value.normalize("NFKC").trim();
    if (!clean) continue;
    const canonical = canonicalProviderTag(clean) ?? clean;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    output.push(canonical);
  }
  return output;
}

function localizeClassification(
  classification: MediaClassification | undefined,
  locale?: string,
): MediaClassification | undefined {
  if (!classification) return undefined;
  return {
    ...classification,
    genres: localizeProviderTags(classification.genres, locale),
  };
}

export function localizeExternalMediaResult(
  result: ExternalMediaResult,
  locale?: string,
): ExternalMediaResult {
  return {
    ...result,
    genres: localizeProviderTags(result.genres, locale),
    classification: localizeClassification(result.classification, locale),
  };
}

export function localizeMediaItem(item: MediaItem, locale?: string): MediaItem {
  return {
    ...item,
    genres: localizeProviderTags(item.genres, locale),
    mediaTags: item.mediaTags ? localizeProviderTags(item.mediaTags, locale) : item.mediaTags,
  };
}

export function canonicalizeMediaNoteFormProviderTags(form: MediaNoteForm): MediaNoteForm {
  return {
    ...form,
    genres: canonicalizeProviderTags(form.genres),
  };
}

export function canonicalizeExternalMediaResultProviderTags(result: ExternalMediaResult): ExternalMediaResult {
  return {
    ...result,
    genres: canonicalizeProviderTags(result.genres),
    classification: result.classification ? {
      ...result.classification,
      genres: canonicalizeProviderTags(result.classification.genres),
    } : result.classification,
  };
}

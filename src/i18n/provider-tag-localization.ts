import { getActiveLocale } from "./catalog";
import type { SupportedLocale } from "./locale";
import { EN_PROVIDER_TAG_LABELS, type ProviderTagKey } from "./locales/en/provider-tags";
import { JA_PROVIDER_TAG_LABELS } from "./locales/ja/provider-tags";
import { KO_PROVIDER_TAG_LABELS } from "./locales/ko/provider-tags";
import { ZH_TW_PROVIDER_TAG_LABELS } from "./locales/zh-TW/provider-tags";

const PROVIDER_TAG_LABELS = {
  "zh-TW": ZH_TW_PROVIDER_TAG_LABELS,
  en: EN_PROVIDER_TAG_LABELS,
  ja: JA_PROVIDER_TAG_LABELS,
  ko: KO_PROVIDER_TAG_LABELS,
} as const satisfies Record<SupportedLocale, Record<ProviderTagKey, string>>;

const LABEL_TO_TAG = new Map<string, ProviderTagKey>();

function tagKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

for (const apiTag of Object.keys(EN_PROVIDER_TAG_LABELS) as ProviderTagKey[]) {
  LABEL_TO_TAG.set(tagKey(apiTag), apiTag);
  for (const locale of Object.keys(PROVIDER_TAG_LABELS) as SupportedLocale[]) {
    LABEL_TO_TAG.set(tagKey(PROVIDER_TAG_LABELS[locale][apiTag]), apiTag);
  }
}

function resolvedLocale(locale: string = getActiveLocale()): SupportedLocale {
  return locale === "en" || locale === "ja" || locale === "ko" ? locale : "zh-TW";
}

export function localizeProviderTag(value: unknown, locale?: string): string {
  if (typeof value !== "string") return "";
  const clean = value.normalize("NFKC").trim();
  if (!clean) return "";
  const apiTag = LABEL_TO_TAG.get(tagKey(clean));
  return apiTag ? PROVIDER_TAG_LABELS[resolvedLocale(locale)][apiTag] : clean;
}

/**
 * Build display labels only for values with explicit provider/API provenance.
 * The returned map never changes the stored tag value; UI controls use it only
 * for text rendering, so user-created tags do not need provenance guessing or
 * save-time reverse translation.
 */
export function providerTagDisplayLabels(
  apiValues: readonly string[] | undefined,
  locale?: string,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const value of apiValues ?? []) {
    const clean = value.normalize("NFKC").trim();
    if (!clean) continue;
    labels.set(clean, localizeProviderTag(clean, locale));
  }
  return labels;
}

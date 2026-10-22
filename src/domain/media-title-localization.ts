import type { SupportedLocale } from "../i18n/locale";
import { convertChineseScriptForReview } from "./chinese-title-conversion";

/** Provider-supplied title variants. Never treat an unlabelled synonym as a translation. */
export interface MediaTitleVariants {
  fallback: string;
  original?: string;
  romaji?: string;
  localized?: Partial<Record<SupportedLocale, string>>;
}

/**
 * Resolve a display/default-collection title using only titles with known provenance.
 * This is intentionally not machine translation: guessed translations can identify
 * a different work. The caller retains original titles and aliases separately.
 */
export function resolveMediaTitle(variants: MediaTitleVariants, locale: SupportedLocale): string {
  const { fallback, original, romaji, localized = {} } = variants;
  const candidates: Record<SupportedLocale, readonly (string | undefined)[]> = {
    "zh-TW": [localized["zh-TW"], localized["zh-CN"], fallback, original],
    "zh-CN": [localized["zh-CN"], localized["zh-TW"], fallback, original],
    en: [localized.en, romaji, original, fallback],
    ja: [localized.ja, original, romaji, fallback],
    ko: [localized.ko, original, fallback],
  };
  return candidates[locale].map((value) => value?.trim()).find((value) => Boolean(value)) ?? "";
}

/** Strict migration lookup: never fall back to a different language. */
export function verifiedMediaTitle(variants: MediaTitleVariants | undefined, locale: SupportedLocale): string | null {
  const value = variants?.localized?.[locale]?.trim();
  return value || null;
}

export function mergeOfficialTitles(
  existing: Partial<Record<SupportedLocale, string>> | undefined,
  incoming: Partial<Record<SupportedLocale, string>> | undefined,
): Partial<Record<SupportedLocale, string>> {
  const result: Partial<Record<SupportedLocale, string>> = {};
  for (const locale of ["zh-TW", "zh-CN", "en", "ja", "ko"] as const) {
    const value = incoming?.[locale]?.trim() || existing?.[locale]?.trim();
    if (value) result[locale] = value;
  }
  return result;
}

/** Resolve a new import once; keep converted script separate from verified provider titles. */
export function selectNewMediaTitle(
  variants: MediaTitleVariants,
  locale: SupportedLocale,
): { title: string; scriptConversion?: string } {
  const verified = verifiedMediaTitle(variants, locale);
  if (verified) return { title: verified };
  if (locale === "zh-TW" || locale === "zh-CN") {
    const otherLocale = locale === "zh-TW" ? "zh-CN" : "zh-TW";
    const source = variants.localized?.[otherLocale]?.trim();
    const converted = source ? convertChineseScriptForReview(source, locale) : null;
    if (converted) return { title: converted, scriptConversion: converted };
  }
  return { title: resolveMediaTitle(variants, locale) };
}

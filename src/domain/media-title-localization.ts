import type { SupportedLocale } from "../i18n/locale";

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

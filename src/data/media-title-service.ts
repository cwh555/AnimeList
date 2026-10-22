import type { ExternalMediaResult } from "../domain/media-types";
import { selectNewMediaTitle } from "../domain/media-title-localization";
import type { SupportedLocale } from "../i18n/locale";
import { normalizeSupportedLocale } from "../i18n/locale";
import { getActiveLocale } from "../i18n/catalog";

/** Choose a new import title without changing source metadata or verified variants. */
export function localizeExternalMediaResult(
  result: ExternalMediaResult,
  locale: SupportedLocale,
): ExternalMediaResult {
  if (result.provider === "manual") return result;
  const variants = result.titleVariants ?? {
    fallback: result.title,
    original: result.originalTitle,
    romaji: result.romajiTitle,
  };
  const selected = selectNewMediaTitle(variants, locale);
  const title = selected.title || result.title;
  const aliases = [...new Set([
    ...(result.searchTitles ?? []),
    result.title, title, result.originalTitle, result.romajiTitle,
    variants.fallback, variants.original ?? "", variants.romaji ?? "",
    ...Object.values(variants.localized ?? {}),
  ].map(value => value.trim()).filter(Boolean))];
  return {
    ...result,
    title,
    titleVariants: variants,
    searchTitles: aliases,
    ...(selected.scriptConversion
      ? { titleScriptConversions: { [locale]: selected.scriptConversion } }
      : { titleScriptConversions: undefined }),
  };
}

/** Only the provider boundary reads active locale; the resolver above is pure. */
export function localizeActiveMediaResult(result: ExternalMediaResult): ExternalMediaResult {
  return localizeExternalMediaResult(result, normalizeSupportedLocale(getActiveLocale()) ?? "zh-TW");
}

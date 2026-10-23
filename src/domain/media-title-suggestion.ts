import type { ExternalMediaResult, TitleSuggestion } from "./media-types";
import type { SupportedLocale } from "../i18n/locale";
import { chineseScriptCandidate, verifiedMediaTitle } from "./media-title-localization";


/**
 * An original-title/year match is a potential cross-provider work match, NOT
 * identity proof. Never insert a suggested title into verified variants.
 */
function canonical(value: string): string {
  return value.normalize("NFKC").replace(/[\p{P}\p{S}\s]+/gu, "").toLocaleLowerCase();
}
function sameWorkEvidence(source: ExternalMediaResult, candidate: ExternalMediaResult): boolean {
  if (source.mediaType !== candidate.mediaType || !candidate.sourceId
    || (source.provider === candidate.provider && source.sourceId === candidate.sourceId)) return false;
  const year = Number(source.year), otherYear = Number(candidate.year);
  if (!Number.isInteger(year) || year <= 0 || year !== otherYear) return false;
  const original = canonical(source.originalTitle);
  if (!original || original !== canonical(candidate.originalTitle)) return false;
  if (source.format && candidate.format && source.format !== candidate.format
    && source.format !== "unknown" && candidate.format !== "unknown") return false;
  return true;
}
export function suggestCrossProviderTitle(
  source: ExternalMediaResult,
  candidates: readonly ExternalMediaResult[],
  locale: SupportedLocale,
): TitleSuggestion | null {
  if (locale !== "zh-TW" && locale !== "zh-CN") return null;
  const alreadyAvailable = verifiedMediaTitle(source.titleVariants, locale)
    || (source.titleVariants && chineseScriptCandidate(source.titleVariants, locale));
  if (alreadyAvailable) return null;
  const eligible = candidates.filter(candidate => sameWorkEvidence(source, candidate))
    .map(candidate => ({
      candidate,
      title: verifiedMediaTitle(candidate.titleVariants, locale)
        || (candidate.titleVariants && chineseScriptCandidate(candidate.titleVariants, locale)) || "",
    })).filter(entry => Boolean(entry.title));
  const distinct = [...new Map(eligible.map(entry =>
    [entry.candidate.provider + ":" + entry.candidate.sourceId, entry])).values()];
  if (distinct.length !== 1) return null;
  const { candidate, title } = distinct[0];
  if (canonical(title) === canonical(source.title)) return null;
  return {
    title, locale, provider: candidate.provider, sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
  };
}

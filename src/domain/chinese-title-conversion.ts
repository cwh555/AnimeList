import * as OpenCC from "opencc-js";
import type { SupportedLocale } from "../i18n/locale";

let toTraditional: ((value: string) => string) | undefined;
let toSimplified: ((value: string) => string) | undefined;

/**
 * Script conversion only, NOT a verified localized release title.
 * Callers must record the result as script conversion, never as an official translation.
 * Legacy-note changes require review; new imports can apply the preferred script directly.
 */
export function convertChineseScriptForReview(value: string, locale: SupportedLocale): string | null {
  if (!value.trim()) return null;
  if (locale === "zh-TW") {
    toTraditional ??= OpenCC.Converter({ from: "cn", to: "tw" });
    return toTraditional(value);
  }
  if (locale === "zh-CN") {
    toSimplified ??= OpenCC.Converter({ from: "tw", to: "cn" });
    return toSimplified(value);
  }
  return null;
}

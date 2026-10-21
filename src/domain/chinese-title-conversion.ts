import * as OpenCC from "opencc-js";
import type { SupportedLocale } from "../i18n/locale";

let toTraditional: ((value: string) => string) | undefined;
let toSimplified: ((value: string) => string) | undefined;

/**
 * Script conversion only, NOT a verified localized release title.
 * Callers must label the result as unverified and require user confirmation.
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

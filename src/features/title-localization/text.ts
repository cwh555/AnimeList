import { defineTextCatalog, interpolateText } from "../../i18n/catalog";
import { EN_TITLE_LOCALIZATION_MESSAGES } from "../../i18n/locales/en/title-localization";
import { TITLE_LOCALIZATION_MESSAGES } from "../../i18n/locales/zh-TW/title-localization";

const CATALOG = defineTextCatalog("title-localization", TITLE_LOCALIZATION_MESSAGES);
export function titleLocalizationText(
  key: keyof typeof TITLE_LOCALIZATION_MESSAGES,
  values: Record<string, number | string> = {},
): string {
  return CATALOG.text(key, values);
}

/** Settings and their action modal intentionally use English regardless of UI locale. */
export function titleLocalizationSettingsText(
  key: keyof typeof TITLE_LOCALIZATION_MESSAGES,
  values: Record<string, number | string> = {},
): string {
  return interpolateText(EN_TITLE_LOCALIZATION_MESSAGES[key], values);
}

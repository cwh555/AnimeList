import { defineTextCatalog } from "../../i18n/catalog";
import { TITLE_LOCALIZATION_MESSAGES } from "../../i18n/locales/zh-TW/title-localization";

const CATALOG = defineTextCatalog("title-localization", TITLE_LOCALIZATION_MESSAGES);
export function titleLocalizationText(
  key: keyof typeof TITLE_LOCALIZATION_MESSAGES,
  values: Record<string, number | string> = {},
): string {
  return CATALOG.text(key, values);
}

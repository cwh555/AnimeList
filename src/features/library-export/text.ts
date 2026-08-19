import { defineTextCatalog } from "../../i18n/catalog";
import { LIBRARY_EXPORT_MESSAGES } from "../../i18n/locales/zh-TW/library-export";

export const LIBRARY_EXPORT_TEXT = LIBRARY_EXPORT_MESSAGES;
const CATALOG = defineTextCatalog("library-export", LIBRARY_EXPORT_TEXT);

export function libraryExportText(
  key: keyof typeof LIBRARY_EXPORT_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

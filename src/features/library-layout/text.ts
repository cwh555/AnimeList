import { defineTextCatalog } from "../../i18n/catalog";
import { LIBRARY_LAYOUT_MESSAGES } from "../../i18n/locales/zh-TW/library-layout";

export const LIBRARY_LAYOUT_TEXT = LIBRARY_LAYOUT_MESSAGES;
const CATALOG = defineTextCatalog("library-layout", LIBRARY_LAYOUT_TEXT);

export function libraryLayoutText(key: keyof typeof LIBRARY_LAYOUT_TEXT): string {
  return CATALOG.text(key);
}

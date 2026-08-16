import { defineTextCatalog } from "../../i18n/catalog";
import { IMAGE_SECTION_MESSAGES } from "../../i18n/locales/zh-TW/image-section";

export const IMAGE_SECTION_TEXT = IMAGE_SECTION_MESSAGES;
const CATALOG = defineTextCatalog("image-section", IMAGE_SECTION_TEXT);

export function imageSectionText(
  key: keyof typeof IMAGE_SECTION_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

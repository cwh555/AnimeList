import { defineTextCatalog } from "../../i18n/catalog";
import { MANUAL_MEDIA_MESSAGES } from "../../i18n/locales/zh-TW/manual-media";

const CATALOG = defineTextCatalog("manual-media", MANUAL_MEDIA_MESSAGES);
export const MANUAL_MEDIA_TEXT = MANUAL_MEDIA_MESSAGES;

export function manualMediaText(
  key: keyof typeof MANUAL_MEDIA_MESSAGES,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

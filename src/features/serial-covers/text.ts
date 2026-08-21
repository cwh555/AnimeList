import { defineTextCatalog } from "../../i18n/catalog";
import { SERIAL_COVER_MESSAGES } from "../../i18n/locales/zh-TW/serial-cover";

export const SERIAL_COVER_TEXT = SERIAL_COVER_MESSAGES;

const CATALOG = defineTextCatalog("serial-cover", SERIAL_COVER_TEXT);

export function serialCoverText(
  key: keyof typeof SERIAL_COVER_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

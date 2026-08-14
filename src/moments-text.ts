import { defineTextCatalog } from "./i18n/catalog";
import { MOMENTS_MESSAGES } from "./i18n/locales/zh-TW/moments";

export const MOMENTS_TEXT = MOMENTS_MESSAGES;
const CATALOG = defineTextCatalog("moments", MOMENTS_TEXT);

export function momentsText(
  key: keyof typeof MOMENTS_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

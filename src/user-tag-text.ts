import { defineTextCatalog } from "./i18n/catalog";
import { USER_TAG_MESSAGES } from "./i18n/locales/zh-TW";

const CATALOG = defineTextCatalog("user-tag", USER_TAG_MESSAGES);
export type UserTagTextKey = keyof typeof USER_TAG_MESSAGES;

export function userTagText(
  key: UserTagTextKey,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

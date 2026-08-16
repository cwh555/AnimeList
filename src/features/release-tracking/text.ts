import { defineTextCatalog } from "../../i18n/catalog";
import { RELEASE_TRACKING_MESSAGES } from "../../i18n/locales/zh-TW/release-tracking";

export const RELEASE_TRACKING_TEXT = RELEASE_TRACKING_MESSAGES;

const CATALOG = defineTextCatalog("release-tracking", RELEASE_TRACKING_TEXT);

export function releaseTrackingText(
  key: keyof typeof RELEASE_TRACKING_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

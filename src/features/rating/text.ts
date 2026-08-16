import { defineTextCatalog } from "../../i18n/catalog";
import { RATING_MESSAGES } from "../../i18n/locales/zh-TW/rating";

export const RATING_FEATURE_TEXT = RATING_MESSAGES;

const CATALOG = defineTextCatalog("rating", RATING_FEATURE_TEXT);

export function ratingFeatureText(
  key: keyof typeof RATING_FEATURE_TEXT,
  variables: Record<string, string | number>,
): string {
  return CATALOG.text(key, variables);
}

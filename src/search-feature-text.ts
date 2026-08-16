import { defineTextCatalog } from "./i18n/catalog";
import { SEARCH_MESSAGES } from "./i18n/locales/zh-TW/search";

const SEARCH_FEATURE_TEXT = SEARCH_MESSAGES;

const CATALOG = defineTextCatalog("search", SEARCH_FEATURE_TEXT);

type SearchFeatureTextKey = keyof typeof SEARCH_FEATURE_TEXT;
type SearchFeatureTextVariables = Record<string, string | number>;

export function searchFeatureText(
  key: SearchFeatureTextKey,
  variables: SearchFeatureTextVariables = {},
): string {
  return CATALOG.text(key, variables);
}

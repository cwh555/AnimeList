import { defineTextCatalog } from "./i18n/catalog";

export const RATING_FEATURE_TEXT = {
  adjusted: "評分 {original} 不符合 0.5 分級距，已四捨五入為 {rounded}。",
} as const;

const CATALOG = defineTextCatalog("rating", RATING_FEATURE_TEXT);

export function ratingFeatureText(
  key: keyof typeof RATING_FEATURE_TEXT,
  variables: Record<string, string | number>,
): string {
  return CATALOG.text(key, variables);
}

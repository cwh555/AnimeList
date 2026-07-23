const SEARCH_FEATURE_TEXT = {
  "settings.languages.heading": "Search languages",
  "settings.languages.chinese.name": "Chinese titles",
  "settings.languages.chinese.desc": "Use Simplified and Traditional Chinese provider aliases to discover matching works.",
  "settings.languages.english.name": "English titles",
  "settings.languages.english.desc": "Use English titles and provider synonyms to expand searches.",
  "settings.languages.original.name": "Original-language titles",
  "settings.languages.original.desc": "Use native and romanized titles. The original language may be Japanese, Korean, or another language.",
  "library.openFailed": "AnimeList could not open the library: {message}",
  "library.setupFailed": "The library opened, but configured folders could not be created: {message}",
  "duplicate.warning.title": "收藏庫中已有相同作品",
  "duplicate.warning.description": "已找到「{title}」。只有在原文標題、另一個完整別名、年份、格式與已知集數皆一致時才會顯示此警告。",
  "duplicate.warning.open": "開啟既有筆記",
} as const;

type SearchFeatureTextKey = keyof typeof SEARCH_FEATURE_TEXT;
type SearchFeatureTextVariables = Record<string, string | number>;

export function searchFeatureText(
  key: SearchFeatureTextKey,
  variables: SearchFeatureTextVariables = {},
): string {
  return SEARCH_FEATURE_TEXT[key].replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

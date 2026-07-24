export const CLASSIFICATION_FEATURE_TEXT = {
  genres: "作品類型",
  genresHint: "AniList 會預先附加固定類型，也可以自行調整或新增。",
  tags: "作品標籤",
  tagsHint: "AniList 會預先附加固定標籤，也可以自行調整或新增。",
  inputPlaceholder: "搜尋或輸入新項目…",
  add: "新增",
  addCustom: "新增「{value}」",
  empty: "尚未附加",
  remove: "移除 {value}",
} as const;

export function classificationText(
  key: keyof typeof CLASSIFICATION_FEATURE_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CLASSIFICATION_FEATURE_TEXT[key].replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

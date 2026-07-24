export const CLASSIFICATION_TEXT = {
  genres: "作品分類",
  tags: "作品標籤",
  genresHint: "由 AniList 預先附加，也可以自行調整或新增。",
  tagsHint: "由 AniList 預先附加，也可以自行調整或新增。",
  inputPlaceholder: "搜尋或輸入新項目",
  addCustom: "新增「{value}」",
  remove: "移除 {value}",
  empty: "尚未附加",
} as const;

export function classificationText(
  key: keyof typeof CLASSIFICATION_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CLASSIFICATION_TEXT[key].replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

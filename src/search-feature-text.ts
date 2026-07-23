const SEARCH_FEATURE_TEXT = {
  "settings.languages.heading": "搜尋語言",
  "settings.languages.chinese.name": "中文名稱",
  "settings.languages.chinese.desc": "使用資料來源提供的中文譯名擴展搜尋。",
  "settings.languages.english.name": "英文名稱",
  "settings.languages.english.desc": "使用資料來源提供的官方英文名稱擴展搜尋。",
  "settings.languages.original.name": "原文名稱",
  "settings.languages.original.desc": "使用作品原文與羅馬字名稱擴展搜尋；原文依作品可能是日文、韓文等。",
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

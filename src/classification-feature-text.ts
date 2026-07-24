export const CLASSIFICATION_TEXT = {
  genres: "作品分類",
  tags: "作品標籤",
  inputPlaceholder: "搜尋或新增",
  add: "新增",
  addCustom: "新增「{value}」",
  remove: "移除 {value}",
  year: "年份",
  studios: "製作公司",
  creators: "作者／創作者",
  "settings.heading": "作品分類",
  "settings.migrate.name": "整理舊分類資料",
  "settings.migrate.desc": "只在按下按鈕時掃描收藏庫。原始 genres 與 media_tags 會先備份，再移除明確的年份、標題等污染值，並修正放錯欄位的內建分類。",
  "settings.migrate.button": "整理舊資料",
  "settings.migrate.running": "整理中…",
  "settings.migrate.notice": "已掃描 {scanned} 份筆記，更新 {changed} 份，移除 {removed} 個污染值，修正 {moved} 個錯置分類。",
  "settings.migrate.failed": "舊分類資料整理失敗，請查看開發者主控台。",
} as const;

export function classificationText(
  key: keyof typeof CLASSIFICATION_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CLASSIFICATION_TEXT[key].replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

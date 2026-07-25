export const CLASSIFICATION_TEXT = {
  genres: "作品分類",
  tags: "作品標籤",
  inputPlaceholder: "搜尋或新增",
  add: "新增",
  addCustom: "新增「{value}」",
  remove: "移除 {value}",
  year: "年份",
  season: "季度",
  studios: "製作公司",
  creators: "作者／創作者",
  "settings.heading": "作品分類",
  "settings.migrate.name": "清理舊版分類資料",
  "settings.migrate.desc": "逐一從 AniList 重建作品分類。執行前會備份舊分類，並保留使用者自訂標籤、其他 frontmatter 與正文。",
  "settings.migrate.button": "清理舊版資料",
  "settings.migrate.running": "清理中…",
  "settings.migrate.progress": "已處理 {processed} / {total}：{title}",
  "settings.migrate.notice": "已掃描 {scanned} 部作品；更新 {changed} 部、未更動 {unchanged} 部、無法解析 {unresolved} 部。",
  "settings.migrate.changed": "成功更新（{count}）",
  "settings.migrate.unchanged": "未更動（{count}）",
  "settings.migrate.unresolved": "無法解析（{count}）",
  "settings.migrate.empty": "無",
  "settings.migrate.failed": "舊版分類清理失敗，請查看開發者主控台。",
} as const;

export function classificationText(
  key: keyof typeof CLASSIFICATION_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CLASSIFICATION_TEXT[key].replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

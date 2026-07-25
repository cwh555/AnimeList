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
  "settings.heading": "Media classification",
  "settings.migrate.name": "Clean up legacy classification data",
  "settings.migrate.desc": "Rebuild work classifications from AniList only when you run this action. Existing genres and media tags are backed up first. Resolved notes receive canonical broad classifications; existing media tags are preserved unless they are clearly metadata.",
  "settings.migrate.button": "Clean up legacy data",
  "settings.migrate.running": "Cleaning…",
  "settings.migrate.notice": "Scanned {scanned} notes. Resolved {resolved}, unresolved {unresolved}, updated {changed}, removed {removed} legacy values, and moved {moved} misplaced values.",
  "settings.migrate.failed": "Legacy classification cleanup failed. Check the developer console for details.",
} as const;

export function classificationText(
  key: keyof typeof CLASSIFICATION_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CLASSIFICATION_TEXT[key].replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

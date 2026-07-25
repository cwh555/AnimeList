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
  "settings.heading": "Media classification",
  "settings.migrate.name": "Clean up legacy classification data",
  "settings.migrate.desc": "Rebuild classifications from AniList while preserving custom tags, unrelated frontmatter, and note content. Progress and detailed results open in a separate window.",
  "settings.migrate.button": "Run cleanup",
  "settings.migrate.running": "Cleanup in progress…",
  "settings.migrate.modal.title": "Legacy classification cleanup",
  "settings.migrate.modal.desc": "Each media note is matched to AniList and updated only when a reliable canonical work is found.",
  "settings.migrate.progress": "Processed {processed} of {total}: {title}",
  "settings.migrate.notice": "Scanned {scanned} works. Updated {changed}, unchanged {unchanged}, unresolved {unresolved}.",
  "settings.migrate.changed": "Updated ({count})",
  "settings.migrate.unchanged": "Unchanged ({count})",
  "settings.migrate.unresolved": "Unresolved ({count})",
  "settings.migrate.empty": "None",
  "settings.migrate.close": "Close",
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

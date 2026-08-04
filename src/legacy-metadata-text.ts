const TEXT = {
  "settings.heading": "舊版資料清理",
  "settings.description": "把舊版 AnimeList 已經混在一起的分類與製作資訊整理成目前的欄位格式。",
  "settings.name": "自動清理舊版 metadata",
  "settings.desc": "掃描目前設定的媒體資料夾；移除舊版 Bangumi 分類中的年份、格式、改編註記與工作室雜訊，並把動畫製作欄只保留真正的公司。無關 frontmatter 與 Markdown 正文不會修改。",
  "settings.button": "掃描並清理",
  "settings.done": "舊版資料清理完成：掃描 {scanned} 筆，清理 {cleaned} 筆。",
  "settings.failed": "舊版資料清理失敗：{error}",
} as const;

export type LegacyMetadataTextKey = keyof typeof TEXT;

export function legacyMetadataText(
  key: LegacyMetadataTextKey,
  params: Record<string, string | number> = {},
): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    TEXT[key] as string,
  );
}

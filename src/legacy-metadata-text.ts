const TEXT = {
  "settings.heading": "Legacy metadata cleanup",
  "settings.description": "Upgrade existing AnimeList notes to the current metadata schema and refresh classification metadata from AniList.",
  "settings.name": "Upgrade legacy metadata",
  "settings.desc": "Scans configured media folders, cleans legacy mixed tags/studio fields, fetches current AniList classification metadata when a reliable match is available, and writes genres, AniList tags, studio/company, quarter, source material, and origin using the current schema. Unrelated frontmatter and Markdown content are preserved.",
  "settings.button": "Scan and upgrade",
  "settings.modalTitle": "Upgrade legacy metadata",
  "settings.modalDescription": "AnimeList will clean legacy fields and refresh matching works from AniList. This can take a while for large libraries because API requests are rate-limited.",
  "settings.phase.scanning": "Scanning library",
  "settings.phase.enriching": "Fetching AniList metadata",
  "settings.phase.writing": "Updating note",
  "settings.phase.completed": "Completed",
  "settings.progress": "{completed} / {total}",
  "settings.preparing": "Preparing legacy metadata upgrade…",
  "settings.done": "Upgrade complete: {scanned} scanned, {cleaned} updated, {enriched} enriched, {unavailable} without AniList match, {failed} failed.",
  "settings.failed": "Legacy metadata upgrade failed: {error}",
  "settings.reportTitle": "Changed notes and upgrade results",
  "settings.close": "Close",
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

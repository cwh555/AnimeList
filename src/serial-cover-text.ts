export const SERIAL_COVER_TEXT = {
  search: "Search cover",
  searchAgain: "Search again",
  change: "Change cover",
  clear: "Use series cover",
  loading: "Loading cover…",
  autoFound: "Auto-loaded",
  manual: "Selected manually",
  series: "Using series cover",
  notFound: "No confident cover match",
  selectorTitle: "Select cover for {unit} {label}",
  query: "Search query",
  apply: "Apply",
  cancel: "Cancel",
  "settings.heading": "Legacy data compatibility",
  "settings.apiKeyName": "Google Books fallback API key",
  "settings.apiKeyDesc": "Optional. Bangumi is used first without a key. Configure this only to enable Google Books as a secondary fallback when Bangumi has no matching cover.",
  "settings.apiKeyPlaceholder": "Paste API key",
  "settings.name": "Load missing serial covers",
  "settings.desc": "Find covers for manga and novel progress entries that do not already have one. Original titles are resolved once per work before cover providers are queried. Existing covers are never replaced.",
  "settings.button": "Load missing covers",
  "settings.running": "Loading…",
  "settings.cancel": "Cancel",
  "settings.retry": "Retry unsuccessful",
  "settings.copy": "Copy report",
  "settings.summary": "Scanned {scanned} entries. Loaded {loaded}, not found {notFound}, failed {failed}, skipped {skipped}.",
  "settings.failed": "Serial cover loading failed. Check the developer console for details.",
} as const;

export function serialCoverText(
  key: keyof typeof SERIAL_COVER_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return SERIAL_COVER_TEXT[key].replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

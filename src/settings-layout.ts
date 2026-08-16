export const SETTINGS_PAGE_IDS = [
  "general",
  "search-metadata",
  "features",
  "maintenance",
  "updates-cleanup",
] as const;

export type SettingsPageId = typeof SETTINGS_PAGE_IDS[number];

export interface SettingsPageDefinition {
  id: SettingsPageId;
  label: string;
}

export const SETTINGS_PAGES: readonly SettingsPageDefinition[] = [
  { id: "general", label: "General" },
  { id: "search-metadata", label: "Search & metadata" },
  { id: "features", label: "Features" },
  { id: "maintenance", label: "Maintenance" },
  { id: "updates-cleanup", label: "Updates & cleanup" },
];

const FEATURE_SETTINGS_PAGES: Readonly<Record<string, SettingsPageId>> = Object.freeze({
  "release-tracking": "features",
  "serial-cover-settings": "features",
  "user-tag-catalog": "features",
  masterpiece: "features",
  "legacy-metadata-cleanup-settings": "updates-cleanup",
  "version-cleanup-settings": "updates-cleanup",
});

export function normalizeSettingsPage(value: unknown): SettingsPageId {
  return typeof value === "string" && SETTINGS_PAGE_IDS.includes(value as SettingsPageId)
    ? value as SettingsPageId
    : "general";
}

export function settingsPageForFeature(featureId: string): SettingsPageId {
  return FEATURE_SETTINGS_PAGES[featureId] ?? "features";
}

export function settingsPageForKey(
  current: SettingsPageId,
  key: string,
): SettingsPageId | null {
  const index = SETTINGS_PAGE_IDS.indexOf(current);
  if (key === "Home") return SETTINGS_PAGE_IDS[0];
  if (key === "End") return SETTINGS_PAGE_IDS[SETTINGS_PAGE_IDS.length - 1];
  if (key === "ArrowRight" || key === "ArrowDown") {
    return SETTINGS_PAGE_IDS[(index + 1) % SETTINGS_PAGE_IDS.length];
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return SETTINGS_PAGE_IDS[(index - 1 + SETTINGS_PAGE_IDS.length) % SETTINGS_PAGE_IDS.length];
  }
  return null;
}

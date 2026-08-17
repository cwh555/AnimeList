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
  description: string;
}

export const SETTINGS_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: "general",
    label: "General",
    description: "Core settings for the interface, library storage, file locations, and timeline behavior.",
  },
  {
    id: "search-metadata",
    label: "Search & metadata",
    description: "Settings for title search languages and the metadata providers used to enrich your library.",
  },
  {
    id: "features",
    label: "Features",
    description: "Settings for optional AnimeList features and their feature-specific behavior.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Library setup and maintenance actions for folders, templates, and routine upkeep.",
  },
  {
    id: "updates-cleanup",
    label: "Updates & cleanup",
    description: "Tools for update-related migrations and cleaning up legacy or obsolete AnimeList data.",
  },
];

export function getSettingsPageDefinition(page: SettingsPageId): SettingsPageDefinition {
  return SETTINGS_PAGES.find((definition) => definition.id === page) ?? SETTINGS_PAGES[0];
}

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

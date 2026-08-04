import { Notice, type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "./app/feature-types";
import { cleanupLegacyMetadataNotes } from "./data/legacy-metadata-cleanup";
import { legacyMetadataText } from "./legacy-metadata-text";

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown error";
}

export function createLegacyMetadataSettingsSection(
  host: AnimeListFeatureHost,
  cleanup: typeof cleanupLegacyMetadataNotes = cleanupLegacyMetadataNotes,
): FeatureSettingsSection {
  return {
    heading: legacyMetadataText("settings.heading"),
    description: legacyMetadataText("settings.description"),
    definitions: [{
      name: legacyMetadataText("settings.name"),
      desc: legacyMetadataText("settings.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(legacyMetadataText("settings.button"));
          button.setCta();
          button.onClick(async () => {
            try {
              const result = await cleanup(host.app, host.getScanFolders());
              if (result.cleaned > 0) host.refreshViews();
              new Notice(legacyMetadataText("settings.done", {
                scanned: result.scanned,
                cleaned: result.cleaned,
              }));
            } catch (error) {
              console.error("AnimeList legacy metadata cleanup failed", error);
              new Notice(legacyMetadataText("settings.failed", { error: errorMessage(error) }));
            }
          });
        });
      },
    }],
  };
}

export const legacyMetadataSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "legacy-metadata-cleanup-settings",
  contributions: [{
    kind: "settings",
    sections(host) {
      return createLegacyMetadataSettingsSection(host);
    },
  }],
});

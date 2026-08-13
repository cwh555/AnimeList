import { type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "./app/feature-types";
import { DuplicateCoverCleanupModal } from "./version-cleanup-modal";
import { createLegacyMetadataSettingDefinition } from "./legacy-metadata-settings";

export function createVersionCleanupSettingsSection(
  host: AnimeListFeatureHost,
  openCleanup: () => void = () => new DuplicateCoverCleanupModal(host).open(),
): FeatureSettingsSection {
  return {
    page: "updates-cleanup",
    heading: "Version updates",
    description: "Review and apply one-time compatibility cleanups required by newer AnimeList versions.",
    definitions: [{
      name: "Remove duplicate note covers",
      desc: "Preview old default notes that still embed the same cover below animelist-detail, then confirm before AnimeList removes only those generated duplicate lines.",
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText("Review cleanup");
          button.setCta();
          button.onClick(openCleanup);
        });
      },
    }, createLegacyMetadataSettingDefinition(host)],
  };
}

export const versionCleanupSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "version-cleanup-settings",
  contributions: [{
    kind: "settings",
    sections(host) {
      return createVersionCleanupSettingsSection(host);
    },
  }],
});

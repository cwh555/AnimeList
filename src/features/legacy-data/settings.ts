import type { Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "../../app/feature-types";
import { MediaNoteFilenameCleanupModal } from "../../ui/media-note-filename-cleanup-modal";
import { createLegacyMetadataSettingDefinition } from "../legacy-metadata-cleanup/settings";
import { createTitleLocalizationSettingDefinition } from "../title-localization/settings";

/** Existing user-owned notes: opt-in reconciliation, never automatic version migration. */
export function createLegacyDataSettingsSection(
  host: AnimeListFeatureHost,
  openFilenameCleanup: () => void = () => new MediaNoteFilenameCleanupModal(host).open(),
): FeatureSettingsSection {
  return {
    page: "updates-cleanup",
    heading: "Legacy data",
    description: "Review changes to existing notes before applying them.",
    definitions: [{
      name: "Sync note filenames with titles",
      desc: "Preview filename differences without changing note content or frontmatter.",
      render(setting: Setting) {
        setting.addButton(button => {
          button.setButtonText("Review renames");
          button.setCta();
          button.onClick(openFilenameCleanup);
        });
      },
    }, createLegacyMetadataSettingDefinition(host), createTitleLocalizationSettingDefinition(host)],
  };
}

export const legacyDataSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "legacy-data-settings",
  contributions: [{
    kind: "settings",
    sections(host) {
      return createLegacyDataSettingsSection(host);
    },
  }],
});

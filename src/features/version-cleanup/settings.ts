import { type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "../../app/feature-types";
import { MediaNoteFilenameCleanupModal } from "../../ui/media-note-filename-cleanup-modal";
import { DuplicateCoverCleanupModal } from "../../ui/version-cleanup-modal";
import { createLegacyMetadataSettingDefinition } from "../legacy-metadata-cleanup/settings";

export function createVersionCleanupSettingsSection(
  host: AnimeListFeatureHost,
  openCleanup: () => void = () => new DuplicateCoverCleanupModal(host).open(),
  openFilenameCleanup: () => void = () => new MediaNoteFilenameCleanupModal(host).open(),
): FeatureSettingsSection {
  return {
    page: "updates-cleanup",
    heading: "Version updates",
    description: "Review and apply one-time compatibility cleanups required by newer AnimeList versions.",
    definitions: [{
      name: "Sync note filenames with titles",
      desc: "Older AnimeList versions could keep the old Markdown filename after a title edit. Preview safe renames for AnimeList media notes; notes stay in the same folder, content/frontmatter are not rewritten, and filename conflicts use a suffix such as ‘ (2)’.",
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText("Review renames");
          button.setCta();
          button.onClick(openFilenameCleanup);
        });
      },
    }, {
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

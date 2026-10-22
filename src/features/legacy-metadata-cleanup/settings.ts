import { type Setting, type SettingDefinition } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import { LegacyMetadataCleanupModal } from "../../ui/legacy-metadata-cleanup-modal";
import { legacyMetadataSettingsText as legacyMetadataText } from "./text";

export function createLegacyMetadataSettingDefinition(
  host: AnimeListFeatureHost,
  openCleanup: () => void = () => new LegacyMetadataCleanupModal(host).open(),
): SettingDefinition {
  return {
    name: legacyMetadataText("settings.name"),
    desc: "Repair older tag, studio and classification fields with verified AniList data.",
    render: (setting: Setting) => {
      setting.addButton((button) => {
        button.setButtonText(legacyMetadataText("settings.button"));
        button.setCta();
        button.onClick(openCleanup);
      });
    },
  };
}

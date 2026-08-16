import { type Setting, type SettingDefinition } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "../../app/feature-types";
import { LegacyMetadataCleanupModal } from "../../ui/legacy-metadata-cleanup-modal";
import { legacyMetadataText } from "./text";

export function createLegacyMetadataSettingDefinition(
  host: AnimeListFeatureHost,
  openCleanup: () => void = () => new LegacyMetadataCleanupModal(host).open(),
): SettingDefinition {
  return {
    name: legacyMetadataText("settings.name"),
    desc: legacyMetadataText("settings.desc"),
    render: (setting: Setting) => {
      setting.addButton((button) => {
        button.setButtonText(legacyMetadataText("settings.button"));
        button.setCta();
        button.onClick(openCleanup);
      });
    },
  };
}

export function createLegacyMetadataSettingsSection(
  host: AnimeListFeatureHost,
  openCleanup: () => void = () => new LegacyMetadataCleanupModal(host).open(),
): FeatureSettingsSection {
  return {
    page: "updates-cleanup",
    heading: legacyMetadataText("settings.heading"),
    description: legacyMetadataText("settings.description"),
    definitions: [createLegacyMetadataSettingDefinition(host, openCleanup)],
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

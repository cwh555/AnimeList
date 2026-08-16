import { type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "../../app/feature-types";
import { SerialCoverMigrationModal } from "../../ui/serial-covers/migration-modal";
import { configureSerialCoverProvider } from "../../data/serial-covers/provider";
import type { SerialCoverPlugin } from "../../app/serial-covers/serial-cover-service";
import { serialCoverText } from "./text";

export function createSerialCoverSettingsSections(
  plugin: SerialCoverPlugin,
): FeatureSettingsSection[] {
  const apiKey: FeatureSettingsSection = {
    page: "features",
    heading: serialCoverText("settings.heading"),
    definitions: [{
      name: serialCoverText("settings.apiKeyName"),
      desc: serialCoverText("settings.apiKeyDesc"),
      render: (setting: Setting) => {
        setting.addText((input) => {
          input.setPlaceholder(serialCoverText("settings.apiKeyPlaceholder"));
          input.setValue(plugin.settings.googleBooksApiKey ?? "");
          input.onChange(async (value) => {
            plugin.settings.googleBooksApiKey = value.trim();
            configureSerialCoverProvider({ apiKey: plugin.settings.googleBooksApiKey });
            await plugin.saveSettings();
          });
        });
      },
    }],
  };
  const recovery: FeatureSettingsSection = {
    page: "maintenance",
    heading: serialCoverText("settings.maintenanceHeading"),
    definitions: [{
      name: serialCoverText("settings.name"),
      desc: serialCoverText("settings.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(serialCoverText("settings.button"));
          button.setCta();
          button.onClick(() => {
            new SerialCoverMigrationModal(plugin).open();
          });
        });
      },
    }],
  };
  return [apiKey, recovery];
}

export const serialCoverSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "serial-cover-settings",
  dependsOn: ["serial-entry-covers"],
  contributions: [{
    kind: "settings",
    sections(host) {
      return createSerialCoverSettingsSections(host);
    },
  }],
});

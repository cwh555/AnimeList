import { type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "./app/feature-types";
import { SerialCoverMigrationModal } from "./serial-cover-migration-modal";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import type { SerialCoverPlugin } from "./serial-cover-service";
import { serialCoverText } from "./serial-cover-text";

export function createSerialCoverSettingsSection(
  plugin: SerialCoverPlugin,
): FeatureSettingsSection {
  return {
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
    }, {
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
}

export const serialCoverSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "serial-cover-settings",
  dependsOn: ["serial-entry-covers"],
  contributions: [{
    kind: "settings",
    sections(host) {
      return createSerialCoverSettingsSection(host);
    },
  }],
});

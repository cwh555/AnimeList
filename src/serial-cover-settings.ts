import { type Setting } from "obsidian";
import { SerialCoverMigrationModal } from "./serial-cover-migration-modal";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import type { SerialCoverPlugin } from "./serial-cover-service";
import { serialCoverText } from "./serial-cover-text";
import {
  registerSettingsSectionExtension,
  type SettingsSection,
} from "./settings";

const SETTINGS_EXTENSION_ID = "serial-cover";

function createSerialCoverSettingsSection(
  plugin: SerialCoverPlugin,
): SettingsSection {
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
            configureSerialCoverProvider({
              apiKey: plugin.settings.googleBooksApiKey,
            });
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

export function installSerialCoverSettings(
  plugin: SerialCoverPlugin,
): void {
  registerSettingsSectionExtension(
    SETTINGS_EXTENSION_ID,
    () => createSerialCoverSettingsSection(plugin),
  );
}

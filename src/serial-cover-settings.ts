import { type Plugin, type Setting } from "obsidian";
import { SerialCoverMigrationModal, type SerialCoverMigrationHost } from "./serial-cover-migration-modal";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import { serialCoverText } from "./serial-cover-text";
import { AnimeListSettingTab, type SettingsSection } from "./settings";

const SETTINGS_MARKER = Symbol.for("animelist.serial-cover-settings");

interface SerialCoverSettingsHost extends SerialCoverMigrationHost {
  settings: { googleBooksApiKey?: string };
  saveSettings(): Promise<void>;
}

interface SerialCoverSettingTab extends AnimeListSettingTab {
  plugin: AnimeListSettingTab["plugin"] & SerialCoverSettingsHost;
}

export function installSerialCoverSettings(plugin: Plugin): void {
  const prototype = AnimeListSettingTab.prototype as SerialCoverSettingTab;
  if (Reflect.get(prototype, SETTINGS_MARKER) === true) return;
  const original = prototype.getSettingSections;
  prototype.getSettingSections = function getSettingSections(): SettingsSection[] {
    const sections = original.call(this);
    const migration: SettingsSection = {
      heading: serialCoverText("settings.heading"),
      definitions: [{
        name: serialCoverText("settings.apiKeyName"),
        desc: serialCoverText("settings.apiKeyDesc"),
        render: (setting: Setting) => {
          setting.addText((input) => {
            input.setPlaceholder(serialCoverText("settings.apiKeyPlaceholder"));
            input.setValue(this.plugin.settings.googleBooksApiKey ?? "");
            input.onChange(async (value) => {
              this.plugin.settings.googleBooksApiKey = value.trim();
              configureSerialCoverProvider({ apiKey: this.plugin.settings.googleBooksApiKey });
              await this.plugin.saveSettings();
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
              new SerialCoverMigrationModal(this.plugin).open();
            });
          });
        },
      }],
    };
    const setupIndex = Math.max(0, sections.length - 1);
    const existingIndex = sections.findIndex((section) => section.heading === serialCoverText("settings.heading"));
    if (existingIndex >= 0) {
      const next = [...sections];
      next[existingIndex] = {
        ...next[existingIndex],
        definitions: [...next[existingIndex].definitions, ...migration.definitions],
      };
      return next;
    }
    return [...sections.slice(0, setupIndex), migration, ...sections.slice(setupIndex)];
  };
  Object.defineProperty(prototype, SETTINGS_MARKER, { value: true });
  void plugin;
}

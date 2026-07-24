import { Notice, type Plugin, type Setting } from "obsidian";
import { AnimeListSettingTab, type SettingsSection } from "./settings";
import { classificationText } from "./classification-feature-text";
import type { ClassificationMigrationSummary } from "./classification-migration";

const SETTINGS_MARKER = Symbol.for("animelist.media-classification-settings");

interface ClassificationSettingsHost extends Plugin {
  migrateMediaClassification?: () => Promise<ClassificationMigrationSummary>;
}

interface ClassificationSettingTab extends AnimeListSettingTab {
  plugin: AnimeListSettingTab["plugin"] & ClassificationSettingsHost;
}

export function installClassificationSettings(plugin: Plugin): void {
  const prototype = AnimeListSettingTab.prototype as ClassificationSettingTab;
  if (Reflect.get(prototype, SETTINGS_MARKER) === true) return;
  const original = prototype.getSettingSections;
  prototype.getSettingSections = function getSettingSections(): SettingsSection[] {
    const sections = original.call(this);
    const migration: SettingsSection = {
      heading: classificationText("settings.heading"),
      definitions: [{
        name: classificationText("settings.migrate.name"),
        desc: classificationText("settings.migrate.desc"),
        render: (setting: Setting) => {
          setting.addButton((button) => {
            button.setButtonText(classificationText("settings.migrate.button"));
            button.onClick(async () => {
              if (!this.plugin.migrateMediaClassification) return;
              button.buttonEl.disabled = true;
              button.setButtonText(classificationText("settings.migrate.running"));
              try {
                const summary = await this.plugin.migrateMediaClassification();
                new Notice(classificationText("settings.migrate.notice", {
                  scanned: summary.scanned,
                  changed: summary.changed,
                  removed: summary.removed,
                  moved: summary.moved,
                }));
              } catch (error) {
                console.error("AnimeList classification migration failed", error);
                new Notice(classificationText("settings.migrate.failed"));
              } finally {
                button.buttonEl.disabled = false;
                button.setButtonText(classificationText("settings.migrate.button"));
              }
            });
          });
        },
      }],
    };
    const setupIndex = Math.max(0, sections.length - 1);
    return [...sections.slice(0, setupIndex), migration, ...sections.slice(setupIndex)];
  };
  Object.defineProperty(prototype, SETTINGS_MARKER, { value: true });
  void plugin;
}

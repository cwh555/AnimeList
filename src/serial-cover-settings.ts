import { Notice, type Plugin, type Setting } from "obsidian";
import { AnimeListSettingTab, type SettingsSection } from "./settings";
import type {
  SerialCoverMigrationProgress,
  SerialCoverMigrationSummary,
} from "./serial-cover-service";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import { serialCoverText } from "./serial-cover-text";

const SETTINGS_MARKER = Symbol.for("animelist.serial-cover-settings");

interface SerialCoverSettingsHost extends Plugin {
  settings: { googleBooksApiKey?: string };
  saveSettings(): Promise<void>;
  loadMissingSerialCovers?: (
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ) => Promise<SerialCoverMigrationSummary>;
}

interface SerialCoverSettingTab extends AnimeListSettingTab {
  plugin: AnimeListSettingTab["plugin"] & SerialCoverSettingsHost;
}

function summaryVariables(summary: SerialCoverMigrationSummary): Record<string, number> {
  return { scanned: summary.scanned, loaded: summary.loaded, notFound: summary.notFound, failed: summary.failed, skipped: summary.skipped };
}

function report(summary: SerialCoverMigrationSummary): string {
  const lines = [serialCoverText("settings.summary", summaryVariables(summary))];
  for (const detail of summary.details) {
    lines.push(`${detail.status.toUpperCase()} · ${detail.title} · ${detail.label} · ${detail.message}`);
  }
  return lines.join("\n");
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
          const progress = setting.controlEl.createEl("progress", { cls: "al-serial-cover-migration-progress" });
          progress.hidden = true;
          const status = setting.controlEl.createEl("small");
          const reportEl = setting.controlEl.createEl("pre", { cls: "al-serial-cover-report" });
          reportEl.hidden = true;
          let controller: AbortController | null = null;
          setting.addButton((button) => {
            button.setButtonText(serialCoverText("settings.button"));
            button.onClick(async () => {
              if (!this.plugin.loadMissingSerialCovers) return;
              controller = new AbortController();
              button.buttonEl.disabled = true;
              button.setButtonText(serialCoverText("settings.running"));
              progress.hidden = false;
              progress.removeAttribute("value");
              reportEl.hidden = true;
              try {
                const summary = await this.plugin.loadMissingSerialCovers((value) => {
                  progress.max = Math.max(1, value.total);
                  progress.value = value.completed;
                  status.setText(value.message);
                }, controller.signal);
                const output = report(summary);
                reportEl.setText(output);
                reportEl.hidden = false;
                status.setText(serialCoverText("settings.summary", summaryVariables(summary)));
                new Notice(serialCoverText("settings.summary", summaryVariables(summary)));
              } catch (error) {
                console.error("AnimeList serial cover migration failed", error);
                new Notice(serialCoverText("settings.failed"));
              } finally {
                controller = null;
                button.buttonEl.disabled = false;
                button.setButtonText(serialCoverText("settings.button"));
              }
            });
          });
          setting.addButton((button) => {
            button.setButtonText(serialCoverText("settings.cancel"));
            button.onClick(() => controller?.abort());
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

import { Notice, type Plugin, type Setting } from "obsidian";
import { AnimeListSettingTab, type SettingsSection } from "./settings";
import { classificationText } from "./classification-feature-text";
import type {
  ClassificationMigrationEntry,
  ClassificationMigrationProgress,
  ClassificationMigrationSummary,
} from "./classification-migration";

const SETTINGS_MARKER = Symbol.for("animelist.media-classification-settings");

interface ClassificationSettingsHost extends Plugin {
  migrateMediaClassification?: (
    onProgress?: (progress: ClassificationMigrationProgress) => void,
  ) => Promise<ClassificationMigrationSummary>;
}

interface ClassificationSettingTab extends AnimeListSettingTab {
  plugin: AnimeListSettingTab["plugin"] & ClassificationSettingsHost;
}

interface SettingWithElement extends Setting {
  settingEl: HTMLElement;
}

function renderEntryGroup(
  container: HTMLElement,
  label: string,
  entries: readonly ClassificationMigrationEntry[],
): void {
  const details = document.createElement("details");
  details.className = "al-classification-migration-group";
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.appendChild(summary);
  const list = document.createElement("ul");
  const visible = entries.length ? entries : [{ title: classificationText("settings.migrate.empty"), path: "" }];
  for (const entry of visible) {
    const item = document.createElement("li");
    item.textContent = entry.path ? `${entry.title} — ${entry.path}` : entry.title;
    list.appendChild(item);
  }
  details.appendChild(list);
  container.appendChild(details);
}

function renderMigrationResult(container: HTMLElement, summary: ClassificationMigrationSummary): void {
  container.replaceChildren();
  const overview = document.createElement("p");
  overview.className = "al-classification-migration-overview";
  overview.textContent = classificationText("settings.migrate.notice", {
    scanned: summary.scanned,
    changed: summary.changed,
    unchanged: summary.unchangedEntries.length,
    unresolved: summary.unresolved,
  });
  container.appendChild(overview);
  renderEntryGroup(container, classificationText("settings.migrate.changed", { count: summary.changedEntries.length }), summary.changedEntries);
  renderEntryGroup(container, classificationText("settings.migrate.unchanged", { count: summary.unchangedEntries.length }), summary.unchangedEntries);
  renderEntryGroup(container, classificationText("settings.migrate.unresolved", { count: summary.unresolvedEntries.length }), summary.unresolvedEntries);
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
          const settingEl = (setting as SettingWithElement).settingEl;
          const status = document.createElement("div");
          status.className = "al-classification-migration-status";
          status.hidden = true;
          const progress = document.createElement("progress");
          progress.max = 1;
          progress.value = 0;
          const progressText = document.createElement("div");
          progressText.className = "al-classification-migration-progress-text";
          const results = document.createElement("div");
          results.className = "al-classification-migration-results";
          status.append(progress, progressText, results);
          settingEl.appendChild(status);

          setting.addButton((button) => {
            button.setButtonText(classificationText("settings.migrate.button"));
            button.onClick(async () => {
              if (!this.plugin.migrateMediaClassification) return;
              button.buttonEl.disabled = true;
              button.setButtonText(classificationText("settings.migrate.running"));
              status.hidden = false;
              results.replaceChildren();
              progress.max = 1;
              progress.value = 0;
              progressText.textContent = classificationText("settings.migrate.progress", {
                processed: 0,
                total: 0,
                title: "",
              });
              try {
                const summary = await this.plugin.migrateMediaClassification((state) => {
                  progress.max = Math.max(1, state.total);
                  progress.value = state.processed;
                  progressText.textContent = classificationText("settings.migrate.progress", state);
                });
                renderMigrationResult(results, summary);
                new Notice(classificationText("settings.migrate.notice", {
                  scanned: summary.scanned,
                  changed: summary.changed,
                  unchanged: summary.unchangedEntries.length,
                  unresolved: summary.unresolved,
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

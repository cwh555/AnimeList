import { Modal, Notice, type Plugin, type Setting } from "obsidian";
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

function renderEntryGroup(
  container: HTMLElement,
  label: string,
  entries: readonly ClassificationMigrationEntry[],
): void {
  const details = document.createElement("details");
  details.className = "al-classification-migration-group";
  const heading = document.createElement("summary");
  heading.textContent = label;
  details.appendChild(heading);
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

class ClassificationMigrationModal extends Modal {
  constructor(private readonly plugin: ClassificationSettingsHost) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "al-classification-migration-modal");
    this.contentEl.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = classificationText("settings.migrate.modal.title");
    const description = document.createElement("p");
    description.textContent = classificationText("settings.migrate.modal.desc");
    const progress = document.createElement("progress");
    progress.className = "al-classification-migration-progress";
    progress.max = 1;
    progress.value = 0;
    const progressText = document.createElement("p");
    progressText.className = "al-classification-migration-progress-text";
    progressText.textContent = classificationText("settings.migrate.progress", {
      processed: 0,
      total: 0,
      title: "",
    });
    const results = document.createElement("div");
    results.className = "al-classification-migration-results";
    const actions = document.createElement("div");
    actions.className = "al-modal-actions";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = classificationText("settings.migrate.close");
    close.disabled = true;
    close.addEventListener("click", () => this.close());
    actions.appendChild(close);
    this.contentEl.append(heading, description, progress, progressText, results, actions);

    void this.run(progress, progressText, results, close);
  }

  private async run(
    progress: HTMLProgressElement,
    progressText: HTMLElement,
    results: HTMLElement,
    close: HTMLButtonElement,
  ): Promise<void> {
    try {
      if (!this.plugin.migrateMediaClassification) throw new Error("Classification cleanup is unavailable.");
      const summary = await this.plugin.migrateMediaClassification((state) => {
        progress.max = Math.max(1, state.total);
        progress.value = state.processed;
        progressText.textContent = classificationText("settings.migrate.progress", {
          processed: state.processed,
          total: state.total,
          title: state.title,
        });
      });
      progress.max = Math.max(1, summary.scanned);
      progress.value = summary.scanned;
      progressText.textContent = classificationText("settings.migrate.notice", {
        scanned: summary.scanned,
        changed: summary.changed,
        unchanged: summary.unchangedEntries.length,
        unresolved: summary.unresolved,
      });
      renderMigrationResult(results, summary);
    } catch (error) {
      console.error("AnimeList classification migration failed", error);
      results.textContent = classificationText("settings.migrate.failed");
      new Notice(classificationText("settings.migrate.failed"));
    } finally {
      close.disabled = false;
    }
  }
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
            button.onClick(() => new ClassificationMigrationModal(this.plugin).open());
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

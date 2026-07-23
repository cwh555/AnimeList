import { Modal, Notice, TFile } from "obsidian";
import { AnimeListPlugin } from "./main";
import {
  nextReadingProgressValue,
  normalizeReadingProgressEntry,
  normalizeReadingProgressLog,
  normalizeReadingProgressUnit,
  readingProgressEntryKey,
  serializeReadingProgressLog,
  synchronizeProgressWithReadingLog,
} from "./reading-progress";
import { READING_PROGRESS_TEXT as TEXT } from "./reading-progress-text";
import type { ReadingProgressEntry } from "./types";

const UNIT_OPTIONS = [
  ["chapter", TEXT.unitChapter],
  ["season", TEXT.unitSeason],
  ["volume", TEXT.unitVolume],
] as const;

function todayString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function field(labelText: string, input: HTMLInputElement | HTMLSelectElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "al-form-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, input);
  return label;
}

function textInput(type: string, value: unknown): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  input.value = String(value ?? "");
  return input;
}

function unitSelect(value: unknown): HTMLSelectElement {
  const select = document.createElement("select");
  const selected = normalizeReadingProgressUnit(value) ?? "chapter";
  for (const [unit, label] of UNIT_OPTIONS) {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = label;
    option.selected = unit === selected;
    select.appendChild(option);
  }
  return select;
}

function updateValueInput(input: HTMLInputElement, unit: unknown): void {
  if (unit === "volume") {
    input.type = "text";
    input.removeAttribute("min");
    input.removeAttribute("step");
    return;
  }
  input.type = "number";
  input.min = "0";
  input.step = "1";
}

export class MangaReadingLogModal extends Modal {
  private readonly plugin: AnimeListPlugin;
  private readonly file: TFile;
  private readonly defaultUnit: string;
  private entries: ReadingProgressEntry[];
  private rows!: HTMLDivElement;

  constructor(plugin: AnimeListPlugin, file: TFile) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    this.defaultUnit = normalizeReadingProgressUnit(frontmatter.progress_unit) ?? "chapter";
    this.entries = normalizeReadingProgressLog(frontmatter.reading_log).map((entry) => ({ ...entry }));
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "animelist-edit-modal");
    this.contentEl.empty();

    const heading = document.createElement("div");
    heading.className = "al-modal-heading";
    const title = document.createElement("h2");
    title.textContent = TEXT.title;
    const description = document.createElement("p");
    description.textContent = TEXT.description;
    heading.append(title, description);

    const editor = document.createElement("section");
    editor.className = "al-volume-editor al-reading-log-editor";
    const header = document.createElement("div");
    header.className = "al-volume-editor-header";
    const headerCopy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = TEXT.title;
    headerCopy.appendChild(strong);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "al-secondary-button";
    add.textContent = TEXT.add;
    add.addEventListener("click", () => this.addEntry());
    header.append(headerCopy, add);

    this.rows = document.createElement("div");
    this.rows.className = "al-volume-editor-rows";
    editor.append(header, this.rows);

    const actions = document.createElement("div");
    actions.className = "al-modal-actions al-edit-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = TEXT.cancel;
    cancel.addEventListener("click", () => this.close());
    const save = document.createElement("button");
    save.type = "button";
    save.className = "mod-cta";
    save.textContent = TEXT.save;
    save.addEventListener("click", () => void this.save(save));
    actions.append(cancel, save);

    this.contentEl.append(heading, editor, actions);
    this.renderRows();
  }

  private addEntry(): void {
    const unit = normalizeReadingProgressUnit(this.defaultUnit) ?? "chapter";
    this.entries.push({
      value: nextReadingProgressValue(this.entries, unit),
      unit,
      startedAt: "",
      completedAt: todayString(),
    });
    this.renderRows(this.entries.length - 1);
  }

  private renderRows(focusIndex = -1): void {
    this.rows.replaceChildren();
    if (!this.entries.length) {
      const empty = document.createElement("p");
      empty.className = "al-volume-editor-empty";
      empty.textContent = TEXT.empty;
      this.rows.appendChild(empty);
      return;
    }

    this.entries.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "al-volume-row is-unit-selectable";
      const fields = document.createElement("div");
      fields.className = "al-volume-row-fields";

      const value = textInput("text", entry.value);
      const unit = unitSelect(entry.unit);
      updateValueInput(value, unit.value);
      const startedAt = textInput("date", entry.startedAt);
      const completedAt = textInput("date", entry.completedAt || todayString());
      if (!entry.completedAt) entry.completedAt = completedAt.value;

      value.addEventListener("input", () => { entry.value = value.value; });
      unit.addEventListener("change", () => {
        entry.unit = unit.value;
        updateValueInput(value, unit.value);
      });
      startedAt.addEventListener("input", () => { entry.startedAt = startedAt.value; });
      completedAt.addEventListener("input", () => { entry.completedAt = completedAt.value; });
      completedAt.addEventListener("change", () => {
        if (!completedAt.value) completedAt.value = todayString();
        entry.completedAt = completedAt.value;
      });

      fields.append(
        field(TEXT.value, value),
        field(TEXT.unit, unit),
        field(TEXT.startedAt, startedAt),
        field(TEXT.completedAt, completedAt),
      );

      const rowActions = document.createElement("div");
      rowActions.className = "al-volume-row-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "al-delete-button";
      remove.textContent = TEXT.remove;
      remove.addEventListener("click", () => {
        this.entries.splice(index, 1);
        this.renderRows();
      });
      rowActions.appendChild(remove);
      row.append(fields, rowActions);
      this.rows.appendChild(row);

      if (index === focusIndex) {
        window.setTimeout(() => {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          value.focus();
          value.select();
        }, 0);
      }
    });
  }

  private validatedEntries(): ReadingProgressEntry[] {
    const output: ReadingProgressEntry[] = [];
    const seen = new Set<string>();
    for (const raw of this.entries) {
      const entry = normalizeReadingProgressEntry({
        ...raw,
        completed_at: raw.completedAt || todayString(),
      });
      if (!entry) throw new Error(TEXT.invalid);
      if (!entry.completedAt) entry.completedAt = todayString();
      const key = readingProgressEntryKey(entry);
      if (seen.has(key)) throw new Error(TEXT.duplicate);
      seen.add(key);
      output.push(entry);
    }
    return normalizeReadingProgressLog(output);
  }

  private async save(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const entries = this.validatedEntries();
      await this.plugin.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
        const currentUnit = normalizeReadingProgressUnit(frontmatter.progress_unit) ?? "chapter";
        const currentProgress = typeof frontmatter.progress === "number" || typeof frontmatter.progress === "string"
          ? frontmatter.progress
          : 0;
        if (entries.length) frontmatter.reading_log = serializeReadingProgressLog(entries);
        else delete frontmatter.reading_log;
        frontmatter.progress = synchronizeProgressWithReadingLog(currentProgress, currentUnit, entries);
        delete frontmatter.updated_at;
        delete frontmatter.metadata_updated_at;
      });
      this.plugin.refreshViews();
      this.close();
      new Notice(TEXT.saved);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : TEXT.invalid);
      button.disabled = false;
    }
  }
}

export default class AnimeListWithMangaReading extends AnimeListPlugin {
  async onload(): Promise<void> {
    await super.onload();
    this.addCommand({
      id: "add-manga-reading-record",
      name: TEXT.command,
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const enabled = file instanceof TFile
          && this.app.metadataCache.getFileCache(file)?.frontmatter?.media_type === "manga";
        if (!checking && enabled && file) new MangaReadingLogModal(this, file).open();
        return enabled;
      },
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.media_type !== "manga") return;
      menu.addItem((item) => item
        .setTitle(TEXT.command)
        .setIcon("book-open")
        .onClick(() => new MangaReadingLogModal(this, file).open()));
    }));
  }
}

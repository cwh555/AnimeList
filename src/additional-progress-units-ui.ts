import { Notice, TFile } from "obsidian";
import type AnimeListPlugin from "./main";
import {
  compareSerialLabels,
  defaultProgressUnit,
  highestCompletedSerialLabel,
  isReadingProgressUnit,
  normalizeSerialLabel,
  normalizeSerialLog,
  normalizeSerialProgress,
  progressUnitsFor,
  serializeSerialLog,
} from "./progress-units";
import type { ReadingProgressUnit } from "./progress-units";
import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { MediaType, NovelVolumeEntry, ProgressValue } from "./types";

interface ProgressEditorState {
  modal: HTMLElement;
  mediaType: "manga" | "novel";
  editPath: string | null;
  unit: ReadingProgressUnit;
  unitSelect: HTMLSelectElement;
  progressInput: HTMLInputElement;
  progressLabel: HTMLElement | null;
  progressHint: HTMLElement | null;
  entries: NovelVolumeEntry[];
  editor: HTMLElement;
  preparedProgress: ProgressValue;
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isElement(value: unknown): value is Element {
  return typeof value === "object"
    && value !== null
    && "closest" in value
    && typeof Reflect.get(value, "closest") === "function";
}

function mediaTypeValue(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}

function fieldLabel(field: Element): HTMLElement | null {
  return field.querySelector<HTMLElement>(".al-form-label");
}

function fieldHint(field: Element): HTMLElement | null {
  return field.querySelector<HTMLElement>(".al-form-hint");
}

function findUnitSelect(form: Element): HTMLSelectElement | null {
  return [...form.querySelectorAll<HTMLSelectElement>("select")].find((select) => (
    [...select.options].some((option) => (
      option.value === "episode"
      || option.value === "chapter"
      || option.value === "season"
      || option.value === "volume"
    ))
  )) ?? null;
}

function findProgressInput(form: Element): HTMLInputElement | null {
  const field = [...form.querySelectorAll<HTMLElement>(".al-form-field")].find((candidate) => {
    const label = fieldLabel(candidate)?.textContent ?? "";
    return label.includes("目前進度") || label.includes("目前閱讀");
  });
  return field?.querySelector<HTMLInputElement>("input") ?? null;
}

function makeField(label: string, control: HTMLElement, hint = ""): HTMLLabelElement {
  const field = createEl("label", { cls: "al-form-field" });
  field.createSpan({ cls: "al-form-label", text: label });
  field.appendChild(control);
  if (hint) field.createEl("small", { cls: "al-form-hint", text: hint });
  return field;
}

function replaceUnitOptions(
  select: HTMLSelectElement,
  mediaType: "manga" | "novel",
  selected: ReadingProgressUnit,
): void {
  const options = progressUnitsFor(mediaType)
    .filter((unit): unit is ReadingProgressUnit => unit !== "episode")
    .map((unit) => {
      const option = createEl("option", { value: unit, text: progressUnitLabel(unit) });
      option.selected = unit === selected;
      return option;
    });
  select.replaceChildren(...options);
  select.value = selected;
}

function createUnitSelect(
  mediaType: "manga" | "novel",
  selected: ReadingProgressUnit,
): HTMLSelectElement {
  const select = createEl("select");
  replaceUnitOptions(select, mediaType, selected);
  return select;
}

function nextSerialLabel(entries: NovelVolumeEntry[], unit: ReadingProgressUnit): string {
  const values = entries
    .map((entry) => normalizeSerialLabel(entry.label, unit))
    .filter((label): label is string => label !== null && label !== "EX")
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? String(Math.floor(Math.max(...values)) + 1) : "1";
}

function textForUnit(
  key: "editorTitle" | "addEntry" | "empty" | "label" | "progressLabel",
  unit: ReadingProgressUnit,
): string {
  return progressUnitFeatureText(key, { unit: progressUnitLabel(unit) });
}

function renderEditor(state: ProgressEditorState): void {
  state.editor.replaceChildren();
  const header = state.editor.createDiv({ cls: "al-volume-editor-header" });
  const copy = header.createDiv();
  copy.createEl("strong", { text: textForUnit("editorTitle", state.unit) });
  copy.createEl("small", {
    text: progressUnitFeatureText(
      state.unit === "volume" ? "editorDescriptionVolume" : "editorDescriptionInteger",
      { unit: progressUnitLabel(state.unit) },
    ),
  });
  const rows = state.editor.createDiv({ cls: "al-volume-editor-rows" });
  const add = state.editor.createEl("button", {
    cls: "al-secondary-button",
    text: textForUnit("addEntry", state.unit),
  });
  add.type = "button";
  state.entries.sort((left, right) => compareSerialLabels(left.label, right.label, state.unit));

  if (!state.entries.length) {
    rows.createEl("p", {
      cls: "al-volume-editor-empty",
      text: textForUnit("empty", state.unit),
    });
  }

  state.entries.forEach((entry, index) => {
    const row = rows.createDiv({ cls: "al-volume-row" });
    const fields = row.createDiv({ cls: "al-volume-row-fields" });

    const labelInput = createEl("input");
    labelInput.type = "text";
    labelInput.inputMode = state.unit === "volume" ? "decimal" : "numeric";
    labelInput.value = entry.label;
    fields.appendChild(makeField(
      textForUnit("label", state.unit),
      labelInput,
      progressUnitFeatureText(
        state.unit === "volume" ? "labelPlaceholderVolume" : "labelPlaceholderInteger",
      ),
    ));

    const startedAt = createEl("input");
    startedAt.type = "date";
    startedAt.value = entry.startedAt;
    fields.appendChild(makeField(progressUnitFeatureText("startedAt"), startedAt));

    const completedAt = createEl("input");
    completedAt.type = "date";
    completedAt.value = entry.completedAt || todayString();
    entry.completedAt = completedAt.value;
    fields.appendChild(makeField(
      progressUnitFeatureText("completedAt"),
      completedAt,
      progressUnitFeatureText("completedHint"),
    ));

    const actions = row.createDiv({ cls: "al-volume-row-actions" });
    const remove = actions.createEl("button");
    remove.type = "button";
    remove.className = "al-delete-button";
    remove.textContent = progressUnitFeatureText("remove");

    labelInput.addEventListener("input", () => { entry.label = labelInput.value; });
    startedAt.addEventListener("input", () => { entry.startedAt = startedAt.value; });
    completedAt.addEventListener("input", () => { entry.completedAt = completedAt.value; });
    completedAt.addEventListener("change", () => {
      if (!completedAt.value) completedAt.value = todayString();
      entry.completedAt = completedAt.value;
    });
    remove.addEventListener("click", () => {
      state.entries.splice(index, 1);
      renderEditor(state);
    });
  });

  add.addEventListener("click", () => {
    state.entries.push({
      label: nextSerialLabel(state.entries, state.unit),
      startedAt: "",
      completedAt: todayString(),
    });
    renderEditor(state);
    const inputs = state.editor.querySelectorAll<HTMLInputElement>('.al-volume-row input[type="text"]');
    const newest = inputs.item(inputs.length - 1);
    newest?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    newest?.focus({ preventScroll: true });
    newest?.select();
  });
}

function updatePresentation(state: ProgressEditorState): void {
  state.progressInput.type = "text";
  state.progressInput.inputMode = state.unit === "volume" ? "decimal" : "numeric";
  state.progressInput.removeAttribute("min");
  state.progressInput.removeAttribute("step");
  if (state.progressLabel) state.progressLabel.textContent = textForUnit("progressLabel", state.unit);
  if (state.progressHint) {
    state.progressHint.textContent = progressUnitFeatureText(
      state.unit === "volume" ? "progressHintVolume" : "progressHintInteger",
    );
  }
  renderEditor(state);
}

function validateAndPrepare(state: ProgressEditorState): void {
  const unitLabel = progressUnitLabel(state.unit);
  const seen = new Set<string>();
  const entries: NovelVolumeEntry[] = [];
  for (const entry of state.entries) {
    const label = normalizeSerialLabel(entry.label, state.unit);
    if (label === null) {
      throw new Error(progressUnitFeatureText(
        state.unit === "volume" ? "invalidVolume" : "invalidInteger",
        { unit: unitLabel },
      ));
    }
    if (seen.has(label)) {
      throw new Error(progressUnitFeatureText("duplicate", { unit: unitLabel, label }));
    }
    seen.add(label);
    entries.push({
      label,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt || todayString(),
    });
  }
  state.entries = entries.sort((left, right) => compareSerialLabels(left.label, right.label, state.unit));

  const progress = normalizeSerialProgress(state.progressInput.value, state.unit);
  if (progress === null) {
    throw new Error(progressUnitFeatureText(
      state.unit === "volume" ? "invalidVolume" : "invalidInteger",
      { unit: unitLabel },
    ));
  }
  const completed = highestCompletedSerialLabel(state.entries, state.unit);
  state.preparedProgress = completed !== null
    && compareSerialLabels(progress, completed, state.unit) < 0
    ? completed === "EX" ? completed : Number(completed)
    : progress;
  state.progressInput.value = String(state.preparedProgress);
}

function applyState(frontmatter: Record<string, unknown>, state: ProgressEditorState): void {
  frontmatter.progress_unit = state.unit;
  frontmatter.progress = state.preparedProgress;
  const entries = serializeSerialLog(state.entries, state.unit);
  // Retain the existing key so older novel notes remain compatible.
  if (entries.length) frontmatter.volume_log = entries;
  else delete frontmatter.volume_log;
}

export function installAdditionalProgressUnitsUi(plugin: AnimeListPlugin): void {
  const states = new WeakMap<HTMLElement, ProgressEditorState>();
  let activeEditPath: string | null = null;
  let pendingCreate: ProgressEditorState | null = null;
  let pendingEdit: ProgressEditorState | null = null;

  const originalOpenEditModal = plugin.openEditModal.bind(plugin);
  plugin.openEditModal = (path: string): void => {
    activeEditPath = path;
    originalOpenEditModal(path);
  };

  const originalCreateMediaNote = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const state = pendingCreate;
    pendingCreate = null;
    const file = await originalCreateMediaNote(result, form);
    if (state) {
      await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        applyState(frontmatter, state);
      });
    }
    return file;
  };

  const fileManager = plugin.app.fileManager;
  const originalProcessFrontMatter = fileManager.processFrontMatter.bind(fileManager);
  fileManager.processFrontMatter = async (file, callback): Promise<void> => {
    const state = pendingEdit && file.path === pendingEdit.editPath ? pendingEdit : null;
    if (state) pendingEdit = null;
    await originalProcessFrontMatter(file, (frontmatter) => {
      callback(frontmatter);
      if (state) applyState(frontmatter, state);
    });
  };

  const configureForm = (form: Element): void => {
    const modal = form.closest<HTMLElement>(".animelist-modal");
    if (!modal || states.has(modal)) return;

    let unitSelect = findUnitSelect(form);
    let mediaType: MediaType | null = null;
    let editPath: string | null = null;
    let frontmatter: Record<string, unknown> = {};

    if (modal.classList.contains("animelist-edit-modal")) {
      editPath = activeEditPath;
      const file = editPath ? plugin.app.vault.getAbstractFileByPath(editPath) : null;
      if (file instanceof TFile) {
        frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      }
      mediaType = mediaTypeValue(frontmatter.media_type);
    } else if (unitSelect) {
      mediaType = unitSelect.value === "episode"
        ? "anime"
        : unitSelect.value === "chapter"
          ? "manga"
          : "novel";
    }

    if (mediaType !== "manga" && mediaType !== "novel") return;
    const selected = defaultProgressUnit(mediaType, frontmatter.progress_unit ?? unitSelect?.value);
    if (selected === "episode") return;
    const progressInput = findProgressInput(form);
    if (!progressInput) return;
    const progressField = progressInput.closest<HTMLElement>(".al-form-field");

    if (!unitSelect) {
      unitSelect = createUnitSelect(mediaType, selected);
      progressField?.insertAdjacentElement("afterend", makeField("進度單位", unitSelect));
    } else {
      replaceUnitOptions(unitSelect, mediaType, selected);
    }

    const originalEditor = form.querySelector<HTMLElement>(".al-volume-editor");
    if (originalEditor) {
      originalEditor.hidden = true;
      originalEditor.setAttribute("aria-hidden", "true");
    }
    const editor = createEl("section", { cls: "al-volume-editor al-progress-unit-editor" });
    const favorite = form.querySelector(".al-form-checkbox");
    if (favorite) favorite.insertAdjacentElement("beforebegin", editor);
    else form.appendChild(editor);

    const state: ProgressEditorState = {
      modal,
      mediaType,
      editPath,
      unit: selected,
      unitSelect,
      progressInput,
      progressLabel: progressField ? fieldLabel(progressField) : null,
      progressHint: progressField ? fieldHint(progressField) : null,
      entries: normalizeSerialLog(frontmatter.volume_log, selected),
      editor,
      preparedProgress: normalizeSerialProgress(progressInput.value, selected) ?? 0,
    };
    states.set(modal, state);
    updatePresentation(state);
    unitSelect.addEventListener("change", () => {
      if (!isReadingProgressUnit(unitSelect.value)) return;
      state.unit = unitSelect.value;
      updatePresentation(state);
    });
  };

  const configureWithin = (root: ParentNode): void => {
    if (isElement(root) && root.matches(".al-media-form")) configureForm(root);
    root.querySelectorAll<HTMLElement>(".al-media-form").forEach(configureForm);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (isElement(node)) configureWithin(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  configureWithin(document);

  const handleClick = (event: MouseEvent): void => {
    if (!isElement(event.target)) return;
    const button = event.target.closest<HTMLButtonElement>("button.mod-cta");
    const modal = button?.closest<HTMLElement>(".animelist-modal");
    if (!button || !modal) return;
    const state = states.get(modal);
    if (!state) return;
    try {
      validateAndPrepare(state);
      if (state.editPath) pendingEdit = state;
      else pendingCreate = state;
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      new Notice(error instanceof Error ? error.message : String(error));
    }
  };
  document.addEventListener("click", handleClick, true);

  plugin.register(() => {
    observer.disconnect();
    document.removeEventListener("click", handleClick, true);
    plugin.openEditModal = originalOpenEditModal;
    plugin.createMediaNote = originalCreateMediaNote;
    fileManager.processFrontMatter = originalProcessFrontMatter;
  });
}

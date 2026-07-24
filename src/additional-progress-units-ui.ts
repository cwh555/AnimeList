import { Notice } from "obsidian";
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
import type {
  ExternalMediaResult,
  MediaNoteForm,
  MediaType,
  NovelVolumeEntry,
  ProgressValue,
} from "./types";

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

interface FileManagerLike {
  processFrontMatter(
    file: unknown,
    callback: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void>;
}

interface PluginWithMutableMethods extends AnimeListPlugin {
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<unknown>;
  openEditModal(path: string): void;
}

function todayString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function isElement(value: unknown): value is Element {
  return typeof value === "object"
    && value !== null
    && "closest" in value
    && typeof Reflect.get(value, "closest") === "function";
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
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
  const field = document.createElement("label");
  field.className = "al-form-field";
  const labelElement = document.createElement("span");
  labelElement.className = "al-form-label";
  labelElement.textContent = label;
  field.append(labelElement, control);
  if (hint) {
    const hintElement = document.createElement("small");
    hintElement.className = "al-form-hint";
    hintElement.textContent = hint;
    field.appendChild(hintElement);
  }
  return field;
}

function createUnitSelect(mediaType: "manga" | "novel", selected: ReadingProgressUnit): HTMLSelectElement {
  const select = document.createElement("select");
  for (const unit of progressUnitsFor(mediaType)) {
    if (unit === "episode") continue;
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = progressUnitLabel(unit);
    option.selected = unit === selected;
    select.appendChild(option);
  }
  return select;
}

function replaceUnitOptions(select: HTMLSelectElement, mediaType: "manga" | "novel", selected: ReadingProgressUnit): void {
  select.replaceChildren(...[...progressUnitsFor(mediaType)]
    .filter((unit): unit is ReadingProgressUnit => unit !== "episode")
    .map((unit) => {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = progressUnitLabel(unit);
      option.selected = unit === selected;
      return option;
    }));
  select.value = selected;
}

function nextSerialLabel(entries: NovelVolumeEntry[], unit: ReadingProgressUnit): string {
  const numeric = entries
    .map((entry) => normalizeSerialLabel(entry.label, unit))
    .filter((label): label is string => label !== null && label !== "EX")
    .map(Number)
    .filter(Number.isFinite);
  return numeric.length ? String(Math.floor(Math.max(...numeric)) + 1) : "1";
}

function editorDescription(unit: ReadingProgressUnit): string {
  return progressUnitFeatureText(
    unit === "volume" ? "editorDescriptionVolume" : "editorDescriptionInteger",
    { unit: progressUnitLabel(unit) },
  );
}

function progressHint(unit: ReadingProgressUnit): string {
  return progressUnitFeatureText(
    unit === "volume" ? "progressHintVolume" : "progressHintInteger",
  );
}

function renderEditor(state: ProgressEditorState): void {
  const unitLabel = progressUnitLabel(state.unit);
  state.editor.replaceChildren();
  const header = document.createElement("div");
  header.className = "al-volume-editor-header";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = progressUnitFeatureText("editorTitle", { unit: unitLabel });
  const description = document.createElement("small");
  description.textContent = editorDescription(state.unit);
  copy.append(title, description);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "al-secondary-button";
  add.textContent = progressUnitFeatureText("addEntry", { unit: unitLabel });
  header.append(copy, add);

  const rows = document.createElement("div");
  rows.className = "al-volume-editor-rows";
  state.editor.append(header, rows);

  state.entries.sort((left, right) => compareSerialLabels(left.label, right.label, state.unit));
  if (!state.entries.length) {
    const empty = document.createElement("p");
    empty.className = "al-volume-editor-empty";
    empty.textContent = progressUnitFeatureText("empty", { unit: unitLabel });
    rows.appendChild(empty);
  }

  state.entries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "al-volume-row";
    const fields = document.createElement("div");
    fields.className = "al-volume-row-fields";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.inputMode = state.unit === "volume" ? "decimal" : "numeric";
    labelInput.value = entry.label;
    const labelHint = progressUnitFeatureText(
      state.unit === "volume" ? "labelPlaceholderVolume" : "labelPlaceholderInteger",
    );
    fields.appendChild(makeField(
      progressUnitFeatureText("label", { unit: unitLabel }),
      labelInput,
      labelHint,
    ));

    const startedAt = document.createElement("input");
    startedAt.type = "date";
    startedAt.value = entry.startedAt;
    fields.appendChild(makeField(progressUnitFeatureText("startedAt"), startedAt));

    const completedAt = document.createElement("input");
    completedAt.type = "date";
    completedAt.value = entry.completedAt || todayString();
    if (!entry.completedAt) entry.completedAt = completedAt.value;
    fields.appendChild(makeField(
      progressUnitFeatureText("completedAt"),
      completedAt,
      progressUnitFeatureText("completedHint"),
    ));

    const actions = document.createElement("div");
    actions.className = "al-volume-row-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "al-delete-button";
    remove.textContent = progressUnitFeatureText("remove");
    actions.appendChild(remove);
    row.append(fields, actions);
    rows.appendChild(row);

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
    const entry = {
      label: nextSerialLabel(state.entries, state.unit),
      startedAt: "",
      completedAt: todayString(),
    };
    state.entries.push(entry);
    renderEditor(state);
    const labelInputs = state.editor.querySelectorAll<HTMLInputElement>('.al-volume-row input[type="text"]');
    const newest = labelInputs[labelInputs.length - 1];
    newest?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    newest?.focus({ preventScroll: true });
    newest?.select();
  });
}

function updateUnitPresentation(state: ProgressEditorState): void {
  const label = progressUnitLabel(state.unit);
  state.progressInput.type = "text";
  state.progressInput.inputMode = state.unit === "volume" ? "decimal" : "numeric";
  state.progressInput.min = "";
  state.progressInput.step = "";
  if (state.progressLabel) {
    state.progressLabel.textContent = progressUnitFeatureText("progressLabel", { unit: label });
  }
  if (state.progressHint) state.progressHint.textContent = progressHint(state.unit);
  renderEditor(state);
}

function validateAndPrepare(state: ProgressEditorState): void {
  const label = progressUnitLabel(state.unit);
  const seen = new Set<string>();
  const normalizedEntries: NovelVolumeEntry[] = [];
  for (const entry of state.entries) {
    const normalized = normalizeSerialLabel(entry.label, state.unit);
    if (normalized === null) {
      throw new Error(progressUnitFeatureText(
        state.unit === "volume" ? "invalidVolume" : "invalidInteger",
        { unit: label },
      ));
    }
    if (seen.has(normalized)) {
      throw new Error(progressUnitFeatureText("duplicate", { unit: label, label: normalized }));
    }
    seen.add(normalized);
    normalizedEntries.push({
      label: normalized,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt || todayString(),
    });
  }
  state.entries = normalizedEntries.sort((left, right) => (
    compareSerialLabels(left.label, right.label, state.unit)
  ));

  const progress = normalizeSerialProgress(state.progressInput.value, state.unit);
  if (progress === null) {
    throw new Error(progressUnitFeatureText(
      state.unit === "volume" ? "invalidVolume" : "invalidInteger",
      { unit: label },
    ));
  }
  const completed = highestCompletedSerialLabel(state.entries, state.unit);
  let nextProgress = progress;
  if (completed !== null && compareSerialLabels(progress, completed, state.unit) < 0) {
    nextProgress = completed === "EX" ? completed : Number(completed);
  }
  state.preparedProgress = nextProgress;
  state.progressInput.value = String(nextProgress);
}

function applyStateToFrontmatter(frontmatter: Record<string, unknown>, state: ProgressEditorState): void {
  frontmatter.progress_unit = state.unit;
  frontmatter.progress = state.preparedProgress;
  const serialized = serializeSerialLog(state.entries, state.unit);
  // Keep the existing volume_log key as a backward-compatible serial-log container.
  // Old novel notes remain readable and manga gains the same dated-entry behavior.
  if (serialized.length) frontmatter.volume_log = serialized;
  else delete frontmatter.volume_log;
}

export function installAdditionalProgressUnitsUi(plugin: AnimeListPlugin): void {
  const mutablePlugin = plugin as PluginWithMutableMethods;
  const states = new WeakMap<HTMLElement, ProgressEditorState>();
  let activeEditPath: string | null = null;
  let pendingCreate: ProgressEditorState | null = null;
  let pendingEdit: ProgressEditorState | null = null;

  const originalOpenEditModal = mutablePlugin.openEditModal.bind(plugin);
  mutablePlugin.openEditModal = (path: string): void => {
    activeEditPath = path;
    originalOpenEditModal(path);
  };

  const originalCreateMediaNote = mutablePlugin.createMediaNote.bind(plugin);
  mutablePlugin.createMediaNote = async (result, form) => {
    const state = pendingCreate;
    pendingCreate = null;
    const file = await originalCreateMediaNote(result, form);
    if (state && result.mediaType !== "anime") {
      const target = file as { path?: string };
      const vaultFile = target.path ? plugin.app.vault.getAbstractFileByPath(target.path) : null;
      if (vaultFile) {
        await plugin.app.fileManager.processFrontMatter(vaultFile, (frontmatter) => {
          applyStateToFrontmatter(frontmatter, state);
        });
      }
    }
    return file;
  };

  const fileManager = plugin.app.fileManager as unknown as FileManagerLike;
  const originalProcessFrontMatter = fileManager.processFrontMatter.bind(plugin.app.fileManager);
  fileManager.processFrontMatter = async (file, callback): Promise<void> => {
    const path = typeof file === "object" && file !== null && "path" in file
      ? stringValue(Reflect.get(file, "path"))
      : "";
    const state = pendingEdit && pendingEdit.editPath === path ? pendingEdit : null;
    if (state) pendingEdit = null;
    await originalProcessFrontMatter(file, (frontmatter) => {
      callback(frontmatter);
      if (state) applyStateToFrontmatter(frontmatter, state);
    });
  };

  const configureForm = (form: HTMLElement): void => {
    const modal = form.closest<HTMLElement>(".animelist-modal");
    if (!modal || states.has(modal)) return;

    let unitSelect = findUnitSelect(form);
    let mediaType: MediaType | null = null;
    let editPath: string | null = null;
    let frontmatter: Record<string, unknown> = {};

    if (modal.classList.contains("animelist-edit-modal")) {
      editPath = activeEditPath;
      const file = editPath ? plugin.app.vault.getAbstractFileByPath(editPath) : null;
      frontmatter = file
        ? plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}
        : {};
      mediaType = mediaTypeValue(frontmatter.media_type);
    } else if (unitSelect) {
      mediaType = unitSelect.value === "episode"
        ? "anime"
        : unitSelect.value === "chapter"
          ? "manga"
          : "novel";
    }

    if (mediaType !== "manga" && mediaType !== "novel") return;
    const selectedUnit = defaultProgressUnit(mediaType, frontmatter.progress_unit ?? unitSelect?.value);
    if (selectedUnit === "episode") return;
    const progressInput = findProgressInput(form);
    if (!progressInput) return;
    const progressField = progressInput.closest<HTMLElement>(".al-form-field");

    if (!unitSelect) {
      unitSelect = createUnitSelect(mediaType, selectedUnit);
      const unitField = makeField("進度單位", unitSelect);
      progressField?.insertAdjacentElement("afterend", unitField);
    } else {
      replaceUnitOptions(unitSelect, mediaType, selectedUnit);
    }

    const originalEditor = form.querySelector<HTMLElement>(".al-volume-editor");
    if (originalEditor) {
      originalEditor.hidden = true;
      originalEditor.setAttribute("aria-hidden", "true");
    }
    const editor = document.createElement("section");
    editor.className = "al-volume-editor al-progress-unit-editor";
    const favorite = form.querySelector(".al-form-checkbox");
    if (favorite) favorite.insertAdjacentElement("beforebegin", editor);
    else form.appendChild(editor);

    const initialEntries = normalizeSerialLog(frontmatter.volume_log, selectedUnit);
    const state: ProgressEditorState = {
      modal,
      mediaType,
      editPath,
      unit: selectedUnit,
      unitSelect,
      progressInput,
      progressLabel: progressField ? fieldLabel(progressField) : null,
      progressHint: progressField ? fieldHint(progressField) : null,
      entries: initialEntries,
      editor,
      preparedProgress: normalizeSerialProgress(progressInput.value, selectedUnit) ?? 0,
    };
    states.set(modal, state);
    updateUnitPresentation(state);

    unitSelect.addEventListener("change", () => {
      if (!isReadingProgressUnit(unitSelect.value)) return;
      state.unit = unitSelect.value;
      updateUnitPresentation(state);
    });
  };

  const configureWithin = (root: ParentNode): void => {
    if (root instanceof HTMLElement && root.matches(".al-media-form")) configureForm(root);
    root.querySelectorAll<HTMLElement>(".al-media-form").forEach(configureForm);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) configureWithin(node);
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
    mutablePlugin.openEditModal = originalOpenEditModal;
    mutablePlugin.createMediaNote = originalCreateMediaNote;
    fileManager.processFrontMatter = originalProcessFrontMatter;
  });
}

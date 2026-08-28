import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { createSerialEntryDateControls } from "../../ui/serial-entry-date-controls";
import {
  createSerialEntryKeyboardNavigation,
  type SerialEntryKeyboardNavigation,
  type SerialEntryKeyboardTarget,
} from "../../ui/serial-entry-keyboard-navigation";
import { captureScrollPosition, scheduleStableSerialEntryFocus } from "../../ui/serial-covers/scroll-stability";
import {
  compareSerialLabels,
  defaultProgressUnit,
  highestCompletedSerialLabel,
  isReadingProgressUnit,
  normalizeSerialLabel,
  normalizeSerialLog,
  normalizeReadingProgressValue,
  normalizeSerialProgress,
  progressUnitsFor,
  type ReadingProgressUnit,
} from "../../domain/progress-units";
import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./text";
import type { MediaFormContext, MediaFormSubmitContext } from "../../ui/media-form-contracts";
import type { NovelVolumeEntry, ProgressValue } from "../../types";

export const READING_EDITOR_STATE_KEY = "reading-progress-editor";

type RowListener = (state: ReadingProgressEditorState) => void;

export interface ReadingProgressEditorState {
  context: MediaFormContext<AnimeListFeatureHost>;
  unit: ReadingProgressUnit;
  entries: NovelVolumeEntry[];
  editor: HTMLElement;
  preparedProgress: ProgressValue;
  originalTitle: string;
  listeners: Set<RowListener>;
  keyboard: SerialEntryKeyboardNavigation;
  render(): void;
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

function notifyRows(state: ReadingProgressEditorState): void {
  for (const listener of state.listeners) listener(state);
}

function renderEditor(state: ReadingProgressEditorState): void {
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
  const keyboardTargets: SerialEntryKeyboardTarget[] = [];

  if (!state.entries.length) {
    rows.createEl("p", { cls: "al-volume-editor-empty", text: textForUnit("empty", state.unit) });
  }

  state.entries.forEach((entry, index) => {
    const row = rows.createDiv({ cls: "al-volume-row" });
    const fields = row.createDiv({ cls: "al-volume-row-fields" });

    const labelInput = createEl("input");
    labelInput.type = "text";
    labelInput.inputMode = state.unit === "volume" ? "decimal" : "numeric";
    labelInput.value = entry.label;
    const labelField = makeField(
      textForUnit("label", state.unit),
      labelInput,
      progressUnitFeatureText(state.unit === "volume" ? "labelPlaceholderVolume" : "labelPlaceholderInteger"),
    );
    labelField.dataset.serialField = "label";
    fields.appendChild(labelField);

    const actions = row.createDiv({ cls: "al-volume-row-actions" });
    const remove = actions.createEl("button", {
      cls: "al-delete-button",
      text: progressUnitFeatureText("remove"),
    });
    remove.type = "button";

    const { startedAt, completedAt } = createSerialEntryDateControls({
      labelInput,
      removeButton: remove,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt || todayString(),
    });
    fields.appendChild(makeField(progressUnitFeatureText("startedAt"), startedAt));

    entry.completedAt = completedAt.value;
    const completedAtField = makeField(
      progressUnitFeatureText("completedAt"),
      completedAt,
      progressUnitFeatureText("completedHint"),
    );
    completedAtField.dataset.serialField = "completed-at";
    fields.appendChild(completedAtField);

    keyboardTargets.push(
      labelInput,
      startedAt.parts.year,
      startedAt.parts.month,
      startedAt.parts.day,
      completedAt.parts.year,
      completedAt.parts.month,
      completedAt.parts.day,
      remove,
    );

    labelInput.addEventListener("input", () => { entry.label = labelInput.value; });
    startedAt.addEventListener("input", () => { entry.startedAt = startedAt.value; });
    completedAt.addEventListener("input", () => { entry.completedAt = completedAt.value; });
    completedAt.addEventListener("change", () => {
      if (!completedAt.value) completedAt.value = todayString();
      entry.completedAt = completedAt.value;
    });
    remove.addEventListener("click", () => {
      state.entries.splice(index, 1);
      state.render();
    });
  });

  keyboardTargets.push(
    add,
    () => state.context.modalEl.querySelector<HTMLButtonElement>(".al-modal-actions .mod-cta"),
  );
  state.keyboard.update(keyboardTargets);

  add.addEventListener("click", () => {
    const snapshot = captureScrollPosition(state.editor);
    state.entries.push({
      label: nextSerialLabel(state.entries, state.unit),
      startedAt: "",
      completedAt: todayString(),
    });
    state.render();
    scheduleStableSerialEntryFocus(state.editor, snapshot);
  });
  notifyRows(state);
}

function updatePresentation(state: ReadingProgressEditorState): void {
  const { fields } = state.context;
  fields.progress.type = "text";
  fields.progress.inputMode = "text";
  fields.progress.removeAttribute("min");
  fields.progress.removeAttribute("step");
  const progressField = fields.progress.closest<HTMLElement>(".al-form-field");
  progressField?.querySelector<HTMLElement>(".al-form-label")?.setText(textForUnit("progressLabel", state.unit));
  const hint = progressField?.querySelector<HTMLElement>(".al-form-hint");
  if (hint) {
    hint.setText(progressUnitFeatureText("progressHintFreeform"));
  }
  renderEditor(state);
}

function validateAndPrepare(state: ReadingProgressEditorState): void {
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
    if (seen.has(label)) throw new Error(progressUnitFeatureText("duplicate", { unit: unitLabel, label }));
    seen.add(label);
    entries.push({ ...entry, label, completedAt: entry.completedAt || todayString() });
  }
  state.entries = entries.sort((left, right) => compareSerialLabels(left.label, right.label, state.unit));

  const progress = normalizeReadingProgressValue(state.context.fields.progress.value);
  const strictProgress = normalizeSerialProgress(progress, state.unit);
  const completed = highestCompletedSerialLabel(state.entries, state.unit);
  state.preparedProgress = completed !== null && strictProgress !== null
    && compareSerialLabels(strictProgress, completed, state.unit) < 0
      ? completed === "EX" ? completed : Number(completed)
      : progress;
  state.context.fields.progress.value = String(state.preparedProgress);
}

function originalTitle(context: MediaFormContext<AnimeListFeatureHost>): string {
  const value = context.result?.originalTitle
    || context.result?.romajiTitle
    || context.frontmatter.title_original
    || context.frontmatter.title_romaji
    || context.frontmatter.title;
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function configureReadingEditor(context: MediaFormContext<AnimeListFeatureHost>): void {
  if (context.mediaType !== "manga" && context.mediaType !== "novel") return;
  const selected = defaultProgressUnit(context.mediaType, context.frontmatter.progress_unit ?? context.fields.unit.value);
  if (!isReadingProgressUnit(selected)) return;
  replaceUnitOptions(context.fields.unit, context.mediaType, selected);

  const editor = createEl("section", { cls: "al-volume-editor al-progress-unit-editor" });
  const favoriteRow = context.fields.favorite.closest(".al-form-checkbox");
  if (favoriteRow) favoriteRow.insertAdjacentElement("beforebegin", editor);
  else context.formEl.appendChild(editor);

  const keyboard = createSerialEntryKeyboardNavigation(editor);
  const state: ReadingProgressEditorState = {
    context,
    unit: selected,
    entries: normalizeSerialLog(context.frontmatter.volume_log, selected),
    editor,
    preparedProgress: normalizeReadingProgressValue(context.fields.progress.value),
    originalTitle: originalTitle(context),
    listeners: new Set(),
    keyboard,
    render: () => renderEditor(state),
  };
  context.state.set(READING_EDITOR_STATE_KEY, state);
  updatePresentation(state);
  context.fields.unit.addEventListener("change", () => {
    if (!isReadingProgressUnit(context.fields.unit.value)) return;
    state.unit = context.fields.unit.value;
    state.entries = normalizeSerialLog(state.entries, state.unit);
    updatePresentation(state);
  });
}

function prepareReadingSubmit(context: MediaFormSubmitContext<AnimeListFeatureHost>): void {
  const state = context.state.get(READING_EDITOR_STATE_KEY);
  if (!state || typeof state !== "object" || !("entries" in state)) return;
  const editor = state as ReadingProgressEditorState;
  validateAndPrepare(editor);
  context.form.unit = editor.unit;
  context.form.progress = editor.preparedProgress;
  context.form.volumeLog = editor.entries;
}

export const additionalProgressUnitsFeature = defineFeature<AnimeListFeatureHost>({
  id: "progress-units",
  contributions: [{
    kind: "media-form",
    configure: configureReadingEditor,
    prepareSubmit: prepareReadingSubmit,
  }],
});

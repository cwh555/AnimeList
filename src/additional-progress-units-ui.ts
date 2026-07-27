import type { AnimeListPluginHost } from "./app/plugin-host";
import type { MediaFormContext } from "./app/feature-registry";
import { createSegmentedDateInput } from "./segmented-date-input";
import {
  compareSerialLabels,
  defaultProgressUnit,
  highestCompletedSerialLabel,
  isReadingProgressUnit,
  normalizeSerialLabel,
  normalizeSerialLog,
  normalizeSerialProgress,
  progressUnitsFor,
} from "./progress-units";
import type { ReadingProgressUnit } from "./progress-units";
import {
  progressUnitFeatureText,
  progressUnitLabel,
} from "./progress-unit-feature-text";
import type { NovelVolumeEntry, ProgressValue } from "./types";
import { captureScrollPosition, stabilizeSerialEntryFocus } from "./serial-entry-scroll-stability";

interface ProgressEditorState {
  plugin: AnimeListPluginHost;
  formContext: MediaFormContext;
  mediaType: "manga" | "novel";
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

function fieldLabel(field: Element): HTMLElement | null {
  return field.querySelector<HTMLElement>(".al-form-label");
}

function fieldHint(field: Element): HTMLElement | null {
  return field.querySelector<HTMLElement>(".al-form-hint");
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

    const startedAt = createSegmentedDateInput(entry.startedAt);
    fields.appendChild(makeField(progressUnitFeatureText("startedAt"), startedAt));

    const completedAt = createSegmentedDateInput(entry.completedAt || todayString());
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
    void state.plugin.features.decorateSerialEntry({
      form: state.formContext,
      row,
      entry,
      index,
      refresh: () => renderEditor(state),
    });
  });

  add.addEventListener("click", () => {
    const snapshot = captureScrollPosition(state.editor);
    state.entries.push({
      label: nextSerialLabel(state.entries, state.unit),
      startedAt: "",
      completedAt: todayString(),
    });
    renderEditor(state);
    stabilizeSerialEntryFocus(state.editor, snapshot);
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
      ...entry,
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

export function installAdditionalProgressUnitsUi(plugin: AnimeListPluginHost): void {
  plugin.features.registerMediaForm({
    id: "reading-progress-units",
    order: 10,
    render: (context) => {
      if (context.mediaType !== "manga" && context.mediaType !== "novel") return;
      const mediaType = context.mediaType;
      const selected = defaultProgressUnit(
        mediaType,
        context.frontmatter.progress_unit ?? context.fields.unit?.value,
      );
      if (selected === "episode") return;

      const progressInput = context.fields.progress;
      const progressField = progressInput.closest<HTMLElement>(".al-form-field");
      let unitSelect = context.fields.unit;
      if (!unitSelect) {
        unitSelect = createUnitSelect(mediaType, selected);
        progressField?.insertAdjacentElement(
          "afterend",
          makeField(progressUnitFeatureText("unitField"), unitSelect),
        );
      } else {
        replaceUnitOptions(unitSelect, mediaType, selected);
      }

      const editor = createEl("section", { cls: "al-volume-editor al-progress-unit-editor" });
      const favorite = context.container.querySelector(".al-form-checkbox");
      if (favorite) favorite.insertAdjacentElement("beforebegin", editor);
      else context.container.appendChild(editor);

      const state: ProgressEditorState = {
        plugin,
        formContext: context,
        mediaType,
        unit: selected,
        unitSelect,
        progressInput,
        progressLabel: progressField ? fieldLabel(progressField) : null,
        progressHint: progressField ? fieldHint(progressField) : null,
        entries: normalizeSerialLog(context.frontmatter.volume_log, selected),
        editor,
        preparedProgress: normalizeSerialProgress(progressInput.value, selected) ?? 0,
      };
      context.extensions.set("reading-progress", state);
      updatePresentation(state);
      unitSelect.addEventListener("change", () => {
        if (!isReadingProgressUnit(unitSelect.value)) return;
        state.unit = unitSelect.value;
        updatePresentation(state);
      });
    },
    validate: (context) => {
      const state = context.extensions.get("reading-progress");
      if (state) validateAndPrepare(state as ProgressEditorState);
    },
    collect: (context, form) => {
      const state = context.extensions.get("reading-progress");
      if (!state) return;
      const progress = state as ProgressEditorState;
      form.unit = progress.unit;
      form.progress = progress.preparedProgress;
      form.volumeLog = progress.entries.map((entry) => ({ ...entry }));
    },
  });
}

import type { TFile } from "obsidian";
import type { ExternalMediaResult, MediaNoteForm, MediaType } from "../types";
import { normalizeGenres } from "../domain/media-metadata";
import { normalizeUserTags } from "../domain/user-tags";
import { normalizeMediaStatus } from "../media-status";
import { normalizeReleaseStatus, progressDisplayValue } from "../novel-progress";
import { completedStatusLabel, mediaStatusOptions, uiText } from "../ui-text";
import type { AnimeListUiHost } from "./plugin-host";
import type { MediaFormContext, MediaFormDateControl, MediaFormFields } from "./media-form-contracts";
import { markMediaFormField } from "./media-form-field";
import { formValue, makeEl, numeric, todayString } from "./ui-helpers";
import { createTagChipControl } from "./tag-chip-control";

export function createLabeledField<T extends HTMLElement>(
  parent: HTMLElement,
  labelText: string,
  input: T,
  hintText = "",
): T {
  const wrapper = createEl("label");
  wrapper.className = "al-form-field";
  const label = createSpan();
  label.className = "al-form-label";
  label.textContent = labelText;
  wrapper.append(label, input);
  if (hintText) wrapper.appendChild(makeEl("small", "al-form-hint", hintText));
  parent.appendChild(wrapper);
  return input;
}

export function normalizeDateParts(year: string, month: string, day: string): string {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return "";
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(yearNumber, monthNumber - 1, dayNumber);
  if (date.getFullYear() !== yearNumber || date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) return "";
  return `${year}-${month}-${day}`;
}

function focusNextFormControl(control: HTMLElement): void {
  const scope = control.closest(".modal-content") || control.ownerDocument.body;
  const controls = [...scope.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex]")]
    .filter((candidate) => {
      const disabled = Reflect.get(candidate, "disabled") === true;
      return !disabled && candidate.tabIndex >= 0 && candidate.offsetParent !== null;
    });
  const index = controls.indexOf(control);
  controls[index + 1]?.focus();
}

export function createDateInput(value = ""): MediaFormDateControl {
  const root = createDiv() as MediaFormDateControl;
  root.className = "al-date-input";
  root.setAttribute("role", "group");
  const year = createEl("input");
  const month = createEl("input");
  const day = createEl("input");
  const segments: Array<[HTMLInputElement, number, string, string]> = [
    [year, 4, "YYYY", uiText("date.year")],
    [month, 2, "MM", uiText("date.month")],
    [day, 2, "DD", uiText("date.day")],
  ];
  for (const [input, length, placeholder, label] of segments) {
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = length;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", label);
  }
  year.className = "al-date-year";
  month.className = "al-date-month";
  day.className = "al-date-day";
  root.append(year, makeEl("span", "al-date-separator", "-"), month, makeEl("span", "al-date-separator", "-"), day);

  const emit = (name: string): boolean => root.dispatchEvent(new Event(name, { bubbles: true }));
  const setValue = (nextValue: unknown): void => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(formValue(nextValue)));
    year.value = match?.[1] || "";
    month.value = match?.[2] || "";
    day.value = match?.[3] || "";
  };
  Object.defineProperty(root, "value", {
    configurable: true,
    get: () => normalizeDateParts(year.value, month.value, day.value),
    set: setValue,
  });
  Object.defineProperty(root, "required", {
    configurable: true,
    get: () => year.required,
    set: (required) => {
      year.required = Boolean(required);
      month.required = Boolean(required);
      day.required = Boolean(required);
      root.setAttribute("aria-required", required ? "true" : "false");
    },
  });

  const bindSegment = (
    input: HTMLInputElement,
    maxLength: number,
    nextInput: HTMLInputElement | null = null,
  ): void => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, maxLength);
      if (input.value.length !== maxLength) return;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else focusNextFormControl(input);
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace" || input.value) return;
      const previous = input === day ? month : input === month ? year : null;
      if (previous) {
        event.preventDefault();
        previous.focus();
        previous.select();
      }
    });
  };
  bindSegment(year, 4, month);
  bindSegment(month, 2, day);
  bindSegment(day, 2);
  root.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) emit("change");
  });
  setValue(value);
  return root;
}

export function createTextInput(type: "date", value?: string | number): MediaFormDateControl;
export function createTextInput(type?: string, value?: string | number): HTMLInputElement;
export function createTextInput(
  type = "text",
  value: string | number = "",
): HTMLInputElement | MediaFormDateControl {
  if (type === "date") return createDateInput(String(value));
  const input = createEl("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  return input;
}

export function createSelect(options: Array<[string, string]>, selected: string): HTMLSelectElement {
  const select = createEl("select");
  options.forEach(([value, text]) => {
    const option = createEl("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selected;
    select.appendChild(option);
  });
  return select;
}

export function bindCompletionBehavior(
  status: HTMLSelectElement,
  total: HTMLInputElement | null,
  progress: HTMLInputElement,
  completedAt: MediaFormDateControl,
  noteEl: HTMLElement | null = null,
  mediaType: MediaType = "anime",
): void {
  const sync = () => {
    const completed = status.value === "completed";
    const autoProgress = mediaType === "anime" && completed;
    progress.readOnly = autoProgress;
    progress.classList.toggle("is-auto", autoProgress);
    if (autoProgress) {
      const normalizedTotal = Math.max(0, numeric(total?.value));
      if (normalizedTotal > 0) progress.value = progressDisplayValue(normalizedTotal);
      if (completedAt && !completedAt.value) completedAt.value = todayString();
    } else if (completed && completedAt && !completedAt.value) {
      completedAt.value = todayString();
    }
    if (completedAt) completedAt.required = completed;
    if (noteEl) {
      if (mediaType === "anime") {
        noteEl.textContent = completed
          ? uiText("completion.animeCompleted", { status: completedStatusLabel("anime") })
          : uiText("completion.animeActive");
      } else {
        noteEl.textContent = completed
          ? uiText("completion.readingCompleted")
          : uiText("completion.readingActive");
      }
    }
  };
  status.addEventListener("change", sync);
  total?.addEventListener("input", sync);
  sync();
}

export function bindScoreRequirement(
  status: HTMLSelectElement,
  score: HTMLInputElement,
  mediaType: MediaType = "anime",
): void {
  const sync = () => {
    const required = status.value === "completed";
    score.required = required;
    score.setAttribute("aria-required", required ? "true" : "false");
    score.placeholder = required
      ? uiText("completion.requiredPlaceholder", { status: completedStatusLabel(mediaType === "anime" ? "anime" : mediaType === "manga" ? "manga" : "novel") })
      : uiText("common.optional");
  };
  status.addEventListener("change", sync);
  sync();
}

function genreInputValues(input: HTMLInputElement): string[] {
  return normalizeGenres(String(input?.value || "").split(/[、,，;；\n]+/));
}


export function releaseStatusOptions(selected: unknown = "unknown"): HTMLSelectElement {
  return createSelect([
    ["releasing", uiText("media.release.releasing")],
    ["finished", uiText("media.release.finished")],
    ["hiatus", uiText("media.release.hiatus")],
    ["cancelled", uiText("media.release.cancelled")],
    ["unknown", uiText("media.release.unknown")],
  ], normalizeReleaseStatus(selected));
}

export function mediaFormValues(context: MediaFormContext<AnimeListUiHost>): MediaNoteForm {
  const fields = context.fields;
  return {
    title: fields.title.value.trim(),
    status: normalizeMediaStatus(fields.status.value),
    releaseStatus: normalizeReleaseStatus(fields.releaseStatus?.value),
    progress: fields.progress.value,
    total: fields.total?.value || 0,
    unit: fields.unit.value,
    score: fields.score.value,
    favorite: fields.favorite.checked,
    startedAt: fields.startedAt.value,
    completedAt: fields.completedAt.value,
    genres: genreInputValues(fields.genres),
    userTags: fields.userTags.values(),
    templatePath: fields.template?.value || "",
    volumeLog: [],
  };
}

export function baseUnitOptions(mediaType: MediaType, selectedValue: unknown): Array<[string, string]> {
  const selected = typeof selectedValue === "string" ? selectedValue : "";
  const values: Array<[string, string]> = mediaType === "anime"
    ? [["episode", uiText("media.unit.episode")]]
    : mediaType === "manga"
      ? [["chapter", uiText("media.unit.chapter")]]
      : [["volume", uiText("media.unit.volume")]];
  if (selected && !values.some(([value]) => value === selected)) values.push([selected, selected]);
  return values;
}

export interface MediaEditorInitialValues {
  title: unknown;
  status: unknown;
  releaseStatus: unknown;
  score: unknown;
  startedAt: unknown;
  completedAt: unknown;
  progress: unknown;
  total: unknown;
  unit: unknown;
  genres: unknown;
  userTags?: unknown;
  favorite: boolean;
}

export interface CreateMediaEditorFieldsInput {
  parent: HTMLElement;
  mediaType: MediaType;
  values: MediaEditorInitialValues;
  templateOptions?: Array<[string, string]>;
  selectedTemplate?: string;
  selectedUnit?: string;
  userTagOptions?: readonly string[];
}

function progressFieldLabel(mediaType: MediaType): string {
  if (mediaType === "manga") return uiText("add.progressManga");
  if (mediaType === "novel") return uiText("add.progressNovel");
  return uiText("add.progressAnime");
}

export function createMediaEditorFields({
  parent,
  mediaType,
  values,
  templateOptions,
  selectedTemplate,
  selectedUnit,
  userTagOptions = [],
}: CreateMediaEditorFieldsInput): MediaFormFields {
  const title = createLabeledField(
    parent,
    uiText("add.titleLabel"),
    createTextInput("text", formValue(values.title)),
    uiText("add.required"),
  );
  title.required = true;

  const status = createLabeledField(
    parent,
    uiText("add.statusLabel"),
    createSelect(mediaStatusOptions(), normalizeMediaStatus(values.status)),
  );
  const releaseStatus = mediaType === "anime"
    ? null
    : createLabeledField(
      parent,
      uiText("add.releaseStatusLabel"),
      releaseStatusOptions(values.releaseStatus),
    );

  const score = createLabeledField(
    parent,
    uiText("add.scoreLabel"),
    createTextInput("number", formValue(values.score)),
    uiText("add.scoreHint", { status: completedStatusLabel(mediaType) }),
  );
  score.min = "0";
  score.max = "10";
  score.step = "0.5";
  bindScoreRequirement(status, score, mediaType);

  const startedAt = createLabeledField(
    parent,
    uiText("add.startedAt"),
    createTextInput("date", String(formValue(values.startedAt))),
    uiText("add.startedHint"),
  );
  const completedAt = createLabeledField(
    parent,
    uiText("add.completedAt"),
    createTextInput("date", String(formValue(values.completedAt))),
    uiText("add.completedHint", { status: completedStatusLabel(mediaType) }),
  );

  const progress = createLabeledField(
    parent,
    progressFieldLabel(mediaType),
    createTextInput(mediaType === "anime" ? "number" : "text", formValue(values.progress, 0)),
    mediaType === "novel" ? uiText("add.progressNovelHint") : "",
  );
  markMediaFormField(progress, "progress");
  if (mediaType === "anime") {
    progress.min = "0";
    progress.step = "1";
  }

  const total = mediaType === "anime"
    ? createLabeledField(
      parent,
      uiText("add.total"),
      createTextInput("number", formValue(values.total)),
    )
    : null;
  if (total) {
    total.min = "0";
    total.step = "1";
  }

  const unitValues = baseUnitOptions(mediaType, values.unit);
  const unitSelection = selectedUnit && unitValues.some(([value]) => value === selectedUnit)
    ? selectedUnit
    : unitValues[0][0];
  const unit = createLabeledField(
    parent,
    uiText("add.unit"),
    createSelect(unitValues, unitSelection),
  );
  const genres = createLabeledField(
    parent,
    uiText("add.genres"),
    createTextInput("text", normalizeGenres(values.genres).join("、")),
    uiText("add.genresHint"),
  );
  const userTags = createLabeledField(
    parent,
    uiText("add.userTags"),
    createTagChipControl({
      values: normalizeUserTags(values.userTags),
      suggestions: normalizeUserTags(userTagOptions),
    }),
    uiText("add.userTagsHint"),
  );
  userTags.closest(".al-form-field")?.classList.add("al-form-field-tags");

  const template = templateOptions
    ? createLabeledField(
      parent,
      uiText("add.template"),
      createSelect(
        templateOptions,
        selectedTemplate && templateOptions.some(([value]) => value === selectedTemplate)
          ? selectedTemplate
          : templateOptions[0][0],
      ),
      uiText("add.templateHint"),
    )
    : null;

  const completionNote = makeEl("div", "al-completion-note");
  parent.appendChild(completionNote);
  bindCompletionBehavior(status, total, progress, completedAt, completionNote, mediaType);

  const favoriteWrap = createEl("label");
  favoriteWrap.className = "al-form-checkbox";
  const favorite = createEl("input");
  favorite.type = "checkbox";
  favorite.checked = values.favorite;
  favoriteWrap.append(favorite, ` ${uiText("add.favorite")}`);
  parent.appendChild(favoriteWrap);

  return {
    title,
    status,
    releaseStatus,
    score,
    startedAt,
    completedAt,
    progress,
    total,
    unit,
    genres,
    userTags,
    template,
    favorite,
  };
}

interface CreateMediaFormContextInput {
  mode: "create" | "edit";
  plugin: AnimeListUiHost;
  modalEl: HTMLElement;
  formEl: HTMLElement;
  mediaType: MediaType;
  result: ExternalMediaResult | null;
  file: TFile | null;
  frontmatter: Record<string, unknown>;
  fields: MediaFormFields;
}

export function createMediaFormContext({
  mode, plugin, modalEl, formEl, mediaType, result, file, frontmatter, fields,
}: CreateMediaFormContextInput): MediaFormContext<AnimeListUiHost> {
  return {
    mode,
    host: plugin,
    modalEl,
    formEl,
    mediaType,
    result,
    file,
    frontmatter,
    fields,
    state: new Map(),
  };
}

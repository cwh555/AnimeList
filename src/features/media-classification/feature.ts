import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { resolveMediaSeasonMetadata } from "../../domain/media-classification";
import {
  editableMediaFormatValues,
  normalizeEditableMediaFormat,
  normalizeEditableStudios,
} from "../../domain/media-editable-classification";
import { editableMediaQuarterText, parseEditableMediaQuarterText } from "../../domain/media-quarter";
import {
  compatibleSeasonMetadata,
  compatibleStudios,
} from "../../data/media-frontmatter-compat";
import { storedMediaNeedsClassificationRefresh } from "../../data/stored-media-result";
import type { ExternalMediaResult } from "../../domain/media-types";
import type { MediaFormContext, MediaFormSubmitContext } from "../../ui/media-form-contracts";
import { createSelect, createTextInput } from "../../ui/media-form-controls";
import { mediaFormatLabel, uiText } from "../../ui-text";
import { makeEl } from "../../ui/ui-helpers";

const STATE_KEY = "media-classification-editor";

interface ClassificationEditorState {
  initialFormat: string;
  format: string;
  initialStudios: string[];
  studios: string[];
  initialQuarter: string;
  quarter: string;
  formatDirty: boolean;
  studiosDirty: boolean;
  quarterDirty: boolean;
  formatControl: HTMLSelectElement;
  studiosControl: HTMLInputElement;
  quarterControl: HTMLInputElement;
  refreshNote: HTMLElement | null;
}

interface AnimeClassificationDraft {
  format: string;
  studios: string[];
  quarter: string;
}


function quarterFromResult(result: ExternalMediaResult): string {
  const metadata = resolveMediaSeasonMetadata({
    season: result.classification?.season,
    seasonYear: result.classification?.seasonYear,
    startDate: result.startDate,
    fallbackYear: result.year,
  });
  return editableMediaQuarterText(metadata.season, metadata.seasonYear);
}

function initialDraft<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): AnimeClassificationDraft {
  if (context.mode === "edit") {
    const quarter = compatibleSeasonMetadata(context.frontmatter);
    return {
      format: normalizeEditableMediaFormat(context.frontmatter.format) || context.mediaType,
      studios: normalizeEditableStudios(compatibleStudios(context.frontmatter)),
      quarter: editableMediaQuarterText(quarter.season, quarter.seasonYear),
    };
  }

  const result = context.result;
  if (!result) return { format: context.mediaType, studios: [], quarter: "" };
  const quarter = quarterFromResult(result);
  return {
    format: normalizeEditableMediaFormat(result.format) || context.mediaType,
    studios: normalizeEditableStudios(result.people),
    quarter,
  };
}

function editorItem(label: string, control: HTMLElement): HTMLElement {
  const item = createDiv();
  item.className = "al-media-metadata-item al-media-metadata-editor-item";
  const labelEl = makeEl("div", "al-media-metadata-label", label);
  control.setAttribute("aria-label", label);
  const value = makeEl("div", "al-media-metadata-value al-media-metadata-editor-value");
  const controlWrap = makeEl("div", "al-form-field");
  controlWrap.appendChild(control);
  value.appendChild(controlWrap);
  item.append(labelEl, value);
  return item;
}

function renderEditor<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
  draft: AnimeClassificationDraft,
): ClassificationEditorState | null {
  const host = context.metadataHostEl;
  if (!host) return null;

  const format = createSelect(
    editableMediaFormatValues("anime", draft.format).map((value): [string, string] => [value, mediaFormatLabel(value)]),
    draft.format,
  );
  const studios = createTextInput("text", draft.studios.join("、"));
  studios.placeholder = uiText("add.metadataStudio");
  studios.autocomplete = "off";

  const quarter = createTextInput("text", draft.quarter);
  quarter.autocomplete = "off";
  quarter.maxLength = 7;

  const section = createDiv();
  section.className = "al-media-metadata-section al-media-metadata-editor";
  section.setAttribute("aria-label", uiText("add.metadataTitle"));
  const grid = createDiv();
  grid.className = "al-media-metadata-grid";
  grid.append(
    editorItem(uiText("add.metadataFormat"), format),
    editorItem(uiText("add.metadataStudio"), studios),
    editorItem(uiText("add.metadataSeason"), quarter),
  );
  section.appendChild(grid);
  host.replaceChildren(section);

  const state: ClassificationEditorState = {
    initialFormat: draft.format,
    format: format.value,
    initialStudios: [...draft.studios],
    studios: [...draft.studios],
    initialQuarter: draft.quarter,
    quarter: quarter.value,
    formatDirty: false,
    studiosDirty: false,
    quarterDirty: false,
    formatControl: format,
    studiosControl: studios,
    quarterControl: quarter,
    refreshNote: null,
  };

  const updateFormat = (): void => {
    state.formatDirty = true;
    state.format = normalizeEditableMediaFormat(format.value);
  };
  const updateStudios = (): void => {
    state.studiosDirty = true;
    state.studios = normalizeEditableStudios(studios.value);
  };
  const updateQuarter = (): void => {
    state.quarterDirty = true;
    state.quarter = quarter.value.normalize("NFKC").toLocaleUpperCase();
  };
  format.addEventListener("change", updateFormat);
  studios.addEventListener("input", updateStudios);
  quarter.addEventListener("input", updateQuarter);
  context.onDispose(() => {
    format.removeEventListener("change", updateFormat);
    studios.removeEventListener("input", updateStudios);
    quarter.removeEventListener("input", updateQuarter);
  });

  context.state.set(STATE_KEY, state);
  return state;
}

function applyRefreshedResult(state: ClassificationEditorState, result: ExternalMediaResult): void {
  if (!state.formatDirty) {
    const format = normalizeEditableMediaFormat(result.format) || state.format;
    if (![...state.formatControl.options].some((option) => option.value === format)) {
      const option = createEl("option");
      option.value = format;
      option.textContent = mediaFormatLabel(format);
      state.formatControl.appendChild(option);
    }
    state.initialFormat = format;
    state.format = format;
    state.formatControl.value = format;
  }

  if (!state.studiosDirty) {
    const studios = normalizeEditableStudios(result.people);
    if (studios.length) {
      state.initialStudios = [...studios];
      state.studios = [...studios];
      state.studiosControl.value = studios.join("、");
    }
  }

  if (!state.quarterDirty) {
    const quarter = quarterFromResult(result);
    if (quarter) {
      state.initialQuarter = quarter;
      state.quarter = quarter;
      state.quarterControl.value = quarter;
    }
  }
}

function refreshMissingMetadata<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
  state: ClassificationEditorState,
): void {
  if (context.mode !== "edit" || !storedMediaNeedsClassificationRefresh(context.frontmatter, context.mediaType)) return;
  const host = context.metadataHostEl;
  if (!host) return;
  const note = makeEl("small", "al-metadata-refresh-note", uiText("edit.metadataRefreshing"));
  host.appendChild(note);
  state.refreshNote = note;
  void context.host.enrichStoredMedia(context.frontmatter, context.mediaType).then((enriched) => {
    if (!host.isConnected) return;
    applyRefreshedResult(state, enriched);
    note.remove();
    state.refreshNote = null;
  }).catch((error: unknown) => {
    console.warn("AnimeList edit metadata refresh failed", error);
    if (!host.isConnected) return;
    note.textContent = uiText("edit.metadataRefreshUnavailable");
  });
}

function configureClassificationEditor<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): void {
  if (context.mediaType !== "anime") return;
  if (!context.metadataHostEl) return;
  const state = renderEditor(context, initialDraft(context));
  if (state) refreshMissingMetadata(context, state);
}

function sameStudios(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function prepareClassificationSubmit<Host extends AnimeListFeatureHost>(
  context: MediaFormSubmitContext<Host>,
): void {
  if (context.mediaType !== "anime") return;
  const state = context.state.get(STATE_KEY) as ClassificationEditorState | undefined;
  if (!state) return;

  if (state.format !== state.initialFormat) {
    const format = normalizeEditableMediaFormat(state.format);
    if (!format) throw new Error(`${uiText("add.metadataFormat")}: ${uiText("add.required")}`);
    context.form.format = format;
  }

  if (!sameStudios(state.studios, state.initialStudios)) {
    context.form.studios = normalizeEditableStudios(state.studios);
  }

  if (state.quarter !== state.initialQuarter) {
    const quarter = parseEditableMediaQuarterText(state.quarter);
    if (quarter.kind !== "valid") {
      throw new Error(`${uiText("add.metadataSeason")}: YYYY Q1–Q4`);
    }
    context.form.season = quarter.season;
    context.form.seasonYear = quarter.seasonYear;
  }
}

export const mediaClassificationEditorFeature = defineFeature({
  id: "media-classification-editor",
  contributions: [{
    kind: "media-form",
    configure: configureClassificationEditor,
    prepareSubmit: prepareClassificationSubmit,
  }],
});

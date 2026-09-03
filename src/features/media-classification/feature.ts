import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { resolveMediaSeasonMetadata, type MediaSeason } from "../../domain/media-classification";
import {
  editableMediaFormatValues,
  normalizeEditableMediaFormat,
  normalizeEditableStudios,
} from "../../domain/media-editable-classification";
import { parseEditableMediaQuarter } from "../../domain/media-quarter";
import {
  compatibleSeasonMetadata,
  compatibleStudios,
} from "../../data/media-frontmatter-compat";
import { storedMediaNeedsClassificationRefresh } from "../../data/stored-media-result";
import type { ExternalMediaResult } from "../../domain/media-types";
import type { MediaFormContext, MediaFormSubmitContext } from "../../ui/media-form-contracts";
import { createLabeledField, createSelect, createTextInput } from "../../ui/media-form-controls";
import { mediaFormatLabel, uiText } from "../../ui-text";
import { makeEl } from "../../ui/ui-helpers";

const STATE_KEY = "media-classification-editor";
const FALLBACK_QUARTER_STATE_KEY = "media-quarter-input-fallback";

interface ClassificationEditorState {
  initialFormat: string;
  format: string;
  initialStudios: string[];
  studios: string[];
  initialSeason: string;
  season: string;
  initialYear: string;
  year: string;
  formatDirty: boolean;
  studiosDirty: boolean;
  quarterDirty: boolean;
  formatControl: HTMLSelectElement;
  studiosControl: HTMLInputElement;
  seasonControl: HTMLSelectElement;
  yearControl: HTMLInputElement;
  refreshNote: HTMLElement | null;
}

interface AnimeClassificationDraft {
  format: string;
  studios: string[];
  season: string;
  year: string;
}

interface FallbackQuarterState {
  initialSeason: string;
  initialYear: string;
  season: string;
  year: string;
}

function quarterFromResult(result: ExternalMediaResult): { season: string; year: string } {
  const metadata = resolveMediaSeasonMetadata({
    season: result.classification?.season,
    seasonYear: result.classification?.seasonYear,
    startDate: result.startDate,
    fallbackYear: result.year,
  });
  return {
    season: metadata.season ?? "",
    year: metadata.seasonYear === null ? "" : String(metadata.seasonYear),
  };
}

function initialDraft<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): AnimeClassificationDraft {
  if (context.mode === "edit") {
    const quarter = compatibleSeasonMetadata(context.frontmatter);
    return {
      format: normalizeEditableMediaFormat(context.frontmatter.format) || context.mediaType,
      studios: normalizeEditableStudios(compatibleStudios(context.frontmatter)),
      season: quarter.season ?? "",
      year: quarter.seasonYear === null ? "" : String(quarter.seasonYear),
    };
  }

  const result = context.result;
  if (!result) return { format: context.mediaType, studios: [], season: "", year: "" };
  const quarter = quarterFromResult(result);
  return {
    format: normalizeEditableMediaFormat(result.format) || context.mediaType,
    studios: normalizeEditableStudios(result.people),
    season: quarter.season,
    year: quarter.year,
  };
}

function seasonOptions(): Array<[string, string]> {
  const options: Array<[MediaSeason, string]> = [
    ["winter", `Q1 (${uiText("season.winter")})`],
    ["spring", `Q2 (${uiText("season.spring")})`],
    ["summer", `Q3 (${uiText("season.summer")})`],
    ["fall", `Q4 (${uiText("season.fall")})`],
  ];
  return [["", "—"], ...options];
}

function editorItem(label: string, control: HTMLElement): HTMLElement {
  const item = createDiv();
  item.className = "al-media-metadata-item al-media-metadata-editor-item al-form-field";
  const labelEl = makeEl("div", "al-media-metadata-label", label);
  control.setAttribute("aria-label", label);
  const value = makeEl("div", "al-media-metadata-value al-media-metadata-editor-value");
  value.appendChild(control);
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

  const year = createTextInput("text", draft.year);
  year.inputMode = "numeric";
  year.autocomplete = "off";
  year.maxLength = 4;
  year.placeholder = "YYYY";

  const season = createSelect(seasonOptions(), draft.season);
  const quarterControl = makeEl("div", "al-media-quarter-editor al-form-field");
  quarterControl.append(year, season);

  const section = createDiv();
  section.className = "al-media-metadata-section al-media-metadata-editor";
  section.setAttribute("aria-label", uiText("add.metadataTitle"));
  const grid = createDiv();
  grid.className = "al-media-metadata-grid";
  grid.append(
    editorItem(uiText("add.metadataFormat"), format),
    editorItem(uiText("add.metadataStudio"), studios),
    editorItem(uiText("add.metadataSeason"), quarterControl),
  );
  section.appendChild(grid);
  host.replaceChildren(section);

  const state: ClassificationEditorState = {
    initialFormat: draft.format,
    format: format.value,
    initialStudios: [...draft.studios],
    studios: [...draft.studios],
    initialSeason: draft.season,
    season: season.value,
    initialYear: draft.year,
    year: year.value,
    formatDirty: false,
    studiosDirty: false,
    quarterDirty: false,
    formatControl: format,
    studiosControl: studios,
    seasonControl: season,
    yearControl: year,
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
  const updateYear = (): void => {
    state.quarterDirty = true;
    year.value = year.value.replace(/\D/g, "").slice(0, 4);
    state.year = year.value;
  };
  const updateSeason = (): void => {
    state.quarterDirty = true;
    state.season = season.value;
  };
  format.addEventListener("change", updateFormat);
  studios.addEventListener("input", updateStudios);
  year.addEventListener("input", updateYear);
  season.addEventListener("change", updateSeason);
  context.onDispose(() => {
    format.removeEventListener("change", updateFormat);
    studios.removeEventListener("input", updateStudios);
    year.removeEventListener("input", updateYear);
    season.removeEventListener("change", updateSeason);
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
    if (quarter.season && quarter.year) {
      state.initialSeason = quarter.season;
      state.season = quarter.season;
      state.seasonControl.value = quarter.season;
      state.initialYear = quarter.year;
      state.year = quarter.year;
      state.yearControl.value = quarter.year;
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

function configureFallbackQuarter<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): void {
  const initial = initialDraft(context);
  const year = createLabeledField(
    context.formEl,
    `${uiText("add.metadataSeason")} · ${uiText("date.year")}`,
    createTextInput("text", initial.year),
  );
  year.inputMode = "numeric";
  year.autocomplete = "off";
  year.maxLength = 4;
  year.placeholder = "YYYY";
  const season = createLabeledField(
    context.formEl,
    uiText("add.metadataSeason"),
    createSelect(seasonOptions(), initial.season),
    "YYYY · Q1–Q4",
  );

  const yearField = year.closest<HTMLElement>(".al-form-field");
  const seasonField = season.closest<HTMLElement>(".al-form-field");
  const anchor = context.fields.genres.closest<HTMLElement>(".al-form-field");
  if (anchor && yearField && seasonField) anchor.before(yearField, seasonField);

  const state: FallbackQuarterState = {
    initialSeason: initial.season,
    initialYear: initial.year,
    season: season.value,
    year: year.value,
  };
  context.state.set(FALLBACK_QUARTER_STATE_KEY, state);
  const updateYear = (): void => {
    year.value = year.value.replace(/\D/g, "").slice(0, 4);
    state.year = year.value;
  };
  const updateSeason = (): void => { state.season = season.value; };
  year.addEventListener("input", updateYear);
  season.addEventListener("change", updateSeason);
  context.onDispose(() => {
    year.removeEventListener("input", updateYear);
    season.removeEventListener("change", updateSeason);
  });
}

function configureClassificationEditor<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): void {
  if (context.mediaType !== "anime") return;
  if (!context.metadataHostEl) {
    configureFallbackQuarter(context);
    return;
  }
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
  if (!state) {
    const fallback = context.state.get(FALLBACK_QUARTER_STATE_KEY) as FallbackQuarterState | undefined;
    if (!fallback) return;
    if (fallback.season === fallback.initialSeason && fallback.year === fallback.initialYear) return;
    const quarter = parseEditableMediaQuarter(fallback.season, fallback.year);
    if (quarter.kind !== "valid") {
      throw new Error(`${uiText("add.metadataSeason")}: YYYY / Q1–Q4`);
    }
    context.form.season = quarter.season;
    context.form.seasonYear = quarter.seasonYear;
    return;
  }

  if (state.format !== state.initialFormat) {
    const format = normalizeEditableMediaFormat(state.format);
    if (!format) throw new Error(`${uiText("add.metadataFormat")}: ${uiText("add.required")}`);
    context.form.format = format;
  }

  if (!sameStudios(state.studios, state.initialStudios)) {
    context.form.studios = normalizeEditableStudios(state.studios);
  }

  if (state.season !== state.initialSeason || state.year !== state.initialYear) {
    const quarter = parseEditableMediaQuarter(state.season, state.year);
    if (quarter.kind !== "valid") {
      throw new Error(`${uiText("add.metadataSeason")}: YYYY / Q1–Q4`);
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

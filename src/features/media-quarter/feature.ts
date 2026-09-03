import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { resolveMediaSeasonMetadata, type MediaSeason } from "../../domain/media-classification";
import { parseEditableMediaQuarter } from "../../domain/media-quarter";
import { compatibleSeasonMetadata } from "../../data/media-frontmatter-compat";
import type { MediaFormContext, MediaFormSubmitContext } from "../../ui/media-form-contracts";
import { createLabeledField, createSelect, createTextInput } from "../../ui/media-form-controls";
import { uiText } from "../../ui-text";

const STATE_KEY = "media-quarter-input";

interface QuarterFormState {
  initialSeason: string;
  initialYear: string;
  season: string;
  year: string;
}

function initialQuarter<Host extends AnimeListFeatureHost>(
  context: MediaFormContext<Host>,
): { season: string; year: string } {
  if (context.mode === "edit") {
    const metadata = compatibleSeasonMetadata(context.frontmatter);
    return {
      season: metadata.season ?? "",
      year: metadata.seasonYear === null ? "" : String(metadata.seasonYear),
    };
  }

  const result = context.result;
  if (!result) return { season: "", year: "" };
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

function seasonOptions(): Array<[string, string]> {
  const options: Array<[MediaSeason, string]> = [
    ["winter", `Q1 (${uiText("season.winter")})`],
    ["spring", `Q2 (${uiText("season.spring")})`],
    ["summer", `Q3 (${uiText("season.summer")})`],
    ["fall", `Q4 (${uiText("season.fall")})`],
  ];
  return [["", "—"], ...options];
}

function configureQuarterForm<Host extends AnimeListFeatureHost>(context: MediaFormContext<Host>): void {
  if (context.mediaType !== "anime") return;

  const initial = initialQuarter(context);
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

  const state: QuarterFormState = {
    initialSeason: initial.season,
    initialYear: initial.year,
    season: season.value,
    year: year.value,
  };
  context.state.set(STATE_KEY, state);

  const updateYear = (): void => {
    year.value = year.value.replace(/\D/g, "").slice(0, 4);
    state.year = year.value;
  };
  const updateSeason = (): void => {
    state.season = season.value;
  };
  year.addEventListener("input", updateYear);
  season.addEventListener("change", updateSeason);
  context.onDispose(() => {
    year.removeEventListener("input", updateYear);
    season.removeEventListener("change", updateSeason);
  });
}

function prepareQuarterSubmit<Host extends AnimeListFeatureHost>(
  context: MediaFormSubmitContext<Host>,
): void {
  if (context.mediaType !== "anime") return;
  const state = context.state.get(STATE_KEY) as QuarterFormState | undefined;
  if (!state) return;
  const changed = state.season !== state.initialSeason || state.year !== state.initialYear;
  if (!changed) return;

  const quarter = parseEditableMediaQuarter(state.season, state.year);
  if (quarter.kind !== "valid") {
    throw new Error(`${uiText("add.metadataSeason")}: YYYY / Q1–Q4`);
  }
  context.form.season = quarter.season;
  context.form.seasonYear = quarter.seasonYear;
}

export const mediaQuarterInputFeature = defineFeature({
  id: "media-quarter-input",
  contributions: [{
    kind: "media-form",
    configure: configureQuarterForm,
    prepareSubmit: prepareQuarterSubmit,
  }],
});

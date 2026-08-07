import { resolveMediaSeasonMetadata } from "../domain/media-classification";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { stringArray, stringValue } from "../domain/value-normalization";
import { compatibleSeasonMetadata, compatibleStudios, seasonMetadataFromValues } from "../data/media-frontmatter-compat";
import { mediaFormatLabel, uiText } from "../ui-text";
import { mediaQuarterLabel } from "./media-quarter-label";
import { makeEl } from "./ui-helpers";

export interface MediaClassificationFieldValue {
  key: "format" | "people" | "season";
  label: string;
  value: string;
}

interface MediaClassificationDisplayInput {
  mediaType: MediaType;
  format: string;
  people: readonly string[];
  season: unknown;
  seasonYear: unknown;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinValues(values: readonly string[]): string {
  return uniqueValues(values).join("、");
}

function classificationRows(
  input: MediaClassificationDisplayInput,
  includeEmpty = false,
): MediaClassificationFieldValue[] {
  const rows: MediaClassificationFieldValue[] = [];
  const push = (row: MediaClassificationFieldValue): void => {
    if (includeEmpty || row.value) rows.push(row);
  };

  push({
    key: "format",
    label: uiText("add.metadataFormat"),
    value: mediaFormatLabel(input.format),
  });
  push({
    key: "people",
    label: uiText(input.mediaType === "anime" ? "add.metadataStudio" : "add.metadataAuthors"),
    value: joinValues(input.people),
  });
  if (input.mediaType === "anime") {
    push({
      key: "season",
      label: uiText("add.metadataSeason"),
      value: mediaQuarterLabel(input.season, input.seasonYear),
    });
  }
  return rows;
}

export function mediaClassificationFieldValues(
  result: ExternalMediaResult,
  includeEmpty = false,
): MediaClassificationFieldValue[] {
  const classification = result.classification;
  const canonical = resolveMediaSeasonMetadata({
    season: classification?.season,
    seasonYear: classification?.seasonYear,
    startDate: result.startDate,
    fallbackYear: result.year,
  });
  const inferred = seasonMetadataFromValues(result.rawGenres, canonical.seasonYear ?? result.year);
  return classificationRows({
    mediaType: result.mediaType,
    format: result.format,
    people: result.people,
    season: canonical.season ?? inferred.season,
    seasonYear: canonical.seasonYear ?? inferred.seasonYear,
  }, includeEmpty);
}

export function storedMediaClassificationFieldValues(
  frontmatter: Record<string, unknown>,
  mediaType: MediaType,
  includeEmpty = false,
): MediaClassificationFieldValue[] {
  const season = compatibleSeasonMetadata(frontmatter);
  return classificationRows({
    mediaType,
    format: stringValue(frontmatter.format, mediaType),
    people: mediaType === "anime"
      ? compatibleStudios(frontmatter)
      : stringArray(frontmatter.authors).length
        ? stringArray(frontmatter.authors)
        : stringArray(frontmatter.creators),
    season: season.season,
    seasonYear: season.seasonYear,
  }, includeEmpty);
}

function renderClassificationRows(
  parent: HTMLElement,
  rows: readonly MediaClassificationFieldValue[],
): HTMLElement | null {
  if (!rows.length) return null;
  const section = createDiv();
  section.className = "al-media-metadata-section";
  section.setAttribute("aria-label", uiText("add.metadataTitle"));

  const grid = createDiv();
  grid.className = "al-media-metadata-grid";
  for (const row of rows) {
    const item = createDiv();
    item.className = `al-media-metadata-item al-media-metadata-item-${row.key}`;
    item.append(
      makeEl("div", "al-media-metadata-label", row.label),
      makeEl(
        "div",
        `al-media-metadata-value${row.value ? "" : " is-empty"}`,
        row.value || "—",
      ),
    );
    grid.appendChild(item);
  }

  section.appendChild(grid);
  parent.appendChild(section);
  return section;
}

export function renderMediaClassificationFields(
  parent: HTMLElement,
  result: ExternalMediaResult,
  includeEmpty = false,
): HTMLElement | null {
  return renderClassificationRows(parent, mediaClassificationFieldValues(result, includeEmpty));
}

export function renderStoredMediaClassificationFields(
  parent: HTMLElement,
  frontmatter: Record<string, unknown>,
  mediaType: MediaType,
  includeEmpty = false,
): HTMLElement | null {
  return renderClassificationRows(parent, storedMediaClassificationFieldValues(frontmatter, mediaType, includeEmpty));
}

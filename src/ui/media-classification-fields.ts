import { persistedMediaTags } from "../domain/media-classification";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { normalizeAnimeStudios } from "../domain/media-metadata";
import { stringArray, stringValue } from "../domain/value-normalization";
import { mediaFormatLabel, uiText } from "../ui-text";
import { mediaQuarterLabel } from "./media-quarter-label";
import { appendReadOnlyTagChips } from "./tag-chip-control";
import { makeEl } from "./ui-helpers";

export interface MediaClassificationFieldValue {
  key: "format" | "tags" | "people" | "season" | "source" | "country";
  label: string;
  value: string;
  values?: readonly string[];
}

interface MediaClassificationDisplayInput {
  mediaType: MediaType;
  format: string;
  tags: readonly string[];
  people: readonly string[];
  season: unknown;
  seasonYear: unknown;
  source: string;
  country: string;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  original: "原創",
  manga: "漫畫",
  light_novel: "輕小說",
  visual_novel: "視覺小說",
  video_game: "電子遊戲",
  game: "遊戲",
  novel: "小說",
  web_novel: "網路小說",
  doujinshi: "同人作品",
  anime: "動畫",
  live_action: "真人作品",
  comic: "漫畫",
  multimedia_project: "跨媒體企劃",
  picture_book: "繪本",
  other: "其他",
};

const COUNTRY_LABELS: Readonly<Record<string, string>> = {
  JP: "日本",
  TW: "台灣",
  CN: "中國",
  KR: "韓國",
  US: "美國",
};

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

  const format = mediaFormatLabel(input.format);
  push({ key: "format", label: uiText("add.metadataFormat"), value: format });

  const tags = uniqueValues(input.tags);
  push({
    key: "tags",
    label: uiText("add.metadataTags"),
    value: joinValues(tags),
    values: tags,
  });

  const people = joinValues(input.people);
  push({
    key: "people",
    label: uiText(input.mediaType === "anime" ? "add.metadataStudio" : "add.metadataAuthors"),
    value: people,
  });

  const quarter = input.mediaType === "anime"
    ? mediaQuarterLabel(input.season, input.seasonYear)
    : "";
  if (input.mediaType === "anime") {
    push({ key: "season", label: uiText("add.metadataSeason"), value: quarter });
  }

  push({
    key: "source",
    label: uiText("add.metadataSource"),
    value: input.source ? SOURCE_LABELS[input.source] ?? input.source : "",
  });

  push({
    key: "country",
    label: uiText("add.metadataCountry"),
    value: input.country ? COUNTRY_LABELS[input.country] ?? input.country : "",
  });

  return rows;
}

export function mediaClassificationFieldValues(
  result: ExternalMediaResult,
  includeEmpty = false,
): MediaClassificationFieldValue[] {
  const classification = result.classification;
  return classificationRows({
    mediaType: result.mediaType,
    format: result.format,
    tags: persistedMediaTags(classification),
    people: result.people,
    season: classification?.season,
    seasonYear: classification?.seasonYear,
    source: classification?.source ?? "",
    country: classification?.countryOfOrigin ?? "",
  }, includeEmpty);
}

export function storedMediaClassificationFieldValues(
  frontmatter: Record<string, unknown>,
  mediaType: MediaType,
  includeEmpty = false,
): MediaClassificationFieldValue[] {
  return classificationRows({
    mediaType,
    format: stringValue(frontmatter.format, mediaType),
    tags: stringArray(frontmatter.media_tags),
    people: mediaType === "anime"
      ? normalizeAnimeStudios(frontmatter.studios)
      : stringArray(frontmatter.authors).length
        ? stringArray(frontmatter.authors)
        : stringArray(frontmatter.creators),
    season: frontmatter.season,
    seasonYear: frontmatter.season_year,
    source: stringValue(frontmatter.source_material),
    country: stringValue(frontmatter.country_of_origin),
  }, includeEmpty);
}

function renderClassificationRows(
  parent: HTMLElement,
  rows: readonly MediaClassificationFieldValue[],
): HTMLElement | null {
  if (!rows.length) return null;
  const section = createDiv();
  section.className = "al-media-metadata-section";
  const heading = createEl("h3");
  heading.className = "al-form-section-heading";
  heading.textContent = uiText("add.metadataTitle");
  section.appendChild(heading);

  const grid = createDiv();
  grid.className = "al-media-metadata-grid";

  for (const row of rows) {
    const item = createDiv();
    item.className = `al-media-metadata-item al-media-metadata-item-${row.key}`;
    item.appendChild(makeEl("div", "al-media-metadata-label", row.label));
    if (row.key === "tags" && row.values?.length) {
      appendReadOnlyTagChips(item, row.values);
    } else {
      item.appendChild(makeEl(
        "div",
        `al-media-metadata-value${row.value ? "" : " is-empty"}`,
        row.value || "—",
      ));
    }
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

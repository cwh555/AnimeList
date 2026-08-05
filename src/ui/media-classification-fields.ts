import { persistedMediaTags } from "../domain/media-classification";
import type { ExternalMediaResult } from "../domain/media-types";
import { mediaFormatLabel, uiText } from "../ui-text";
import { mediaQuarterLabel } from "./media-quarter-label";

export interface MediaClassificationFieldValue {
  key: "format" | "tags" | "people" | "season" | "source" | "country";
  label: string;
  value: string;
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

function joinValues(values: readonly string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].join("、");
}

export function mediaClassificationFieldValues(result: ExternalMediaResult): MediaClassificationFieldValue[] {
  const classification = result.classification;
  const rows: MediaClassificationFieldValue[] = [];
  const format = mediaFormatLabel(result.format);
  if (format) rows.push({ key: "format", label: uiText("add.metadataFormat"), value: format });

  const tags = persistedMediaTags(classification);
  if (tags.length) {
    rows.push({ key: "tags", label: uiText("add.metadataTags"), value: joinValues(tags) });
  }

  const people = joinValues(result.people);
  if (people) {
    rows.push({
      key: "people",
      label: uiText(result.mediaType === "anime" ? "add.metadataStudio" : "add.metadataAuthors"),
      value: people,
    });
  }

  const quarter = mediaQuarterLabel(classification?.season, classification?.seasonYear);
  if (quarter) {
    rows.push({
      key: "season",
      label: uiText("add.metadataSeason"),
      value: quarter,
    });
  }

  if (classification?.source) {
    rows.push({
      key: "source",
      label: uiText("add.metadataSource"),
      value: SOURCE_LABELS[classification.source] ?? classification.source,
    });
  }

  if (classification?.countryOfOrigin) {
    rows.push({
      key: "country",
      label: uiText("add.metadataCountry"),
      value: COUNTRY_LABELS[classification.countryOfOrigin] ?? classification.countryOfOrigin,
    });
  }

  return rows;
}

export function renderMediaClassificationFields(parent: HTMLElement, result: ExternalMediaResult): HTMLElement {
  const section = createDiv();
  section.className = "al-media-metadata";
  const heading = createEl("h3");
  heading.className = "al-form-section-heading";
  heading.textContent = uiText("add.metadataTitle");
  section.appendChild(heading);

  for (const row of mediaClassificationFieldValues(result)) {
    const wrapper = createEl("label");
    wrapper.className = "al-form-field";
    const label = createSpan();
    label.className = "al-form-label";
    label.textContent = row.label;
    const input = createEl("input");
    input.type = "text";
    input.value = row.value;
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    wrapper.append(label, input);
    section.appendChild(wrapper);
  }

  parent.appendChild(section);
  return section;
}

import type { MediaType } from "./media-primitives";
import { normalizeStudioNames } from "./studio-identity";
import { stringValue } from "./value-normalization";

const FORMAT_VALUES: Readonly<Record<MediaType, readonly string[]>> = {
  anime: ["tv", "movie", "ova", "ona", "special", "music"],
  manga: ["manga", "one_shot", "manhwa", "manhua"],
  novel: ["light_novel", "novel"],
};

export function editableMediaFormatValues(mediaType: MediaType, current: unknown = ""): string[] {
  const values = [...FORMAT_VALUES[mediaType]];
  const selected = stringValue(current).normalize("NFKC").trim();
  if (selected && !values.includes(selected)) values.push(selected);
  return values;
}

export function normalizeEditableMediaFormat(value: unknown): string {
  return stringValue(value).normalize("NFKC").trim();
}

export function normalizeEditableStudios(values: unknown): string[] {
  return normalizeStudioNames(values, 1);
}

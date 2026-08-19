import {
  LIBRARY_TEXT_EXPORT_FIELDS,
  type LibraryTextExportField,
  type LibraryTextExportRow,
} from "../../domain/library-export";
import { isReadingProgressUnit } from "../../domain/progress-units";
import { progressUnitLabel } from "../progress/text";
import { mediaStatusLabel } from "../../ui-text";
import { MEDIA_UI_LABELS, mediaUnitLabel } from "../../ui/ui-helpers";
import { libraryExportText } from "./text";

const FIELD_TEXT_KEYS: Readonly<Record<LibraryTextExportField,
  | "fieldEntry"
  | "fieldMediaType"
  | "fieldOriginalTitle"
  | "fieldScore"
  | "fieldProgress"
  | "fieldStartedAt"
  | "fieldStatus"
  | "fieldFavorite"
  | "fieldGenres">> = {
  entry: "fieldEntry",
  mediaType: "fieldMediaType",
  originalTitle: "fieldOriginalTitle",
  score: "fieldScore",
  progress: "fieldProgress",
  startedAt: "fieldStartedAt",
  status: "fieldStatus",
  favorite: "fieldFavorite",
  genres: "fieldGenres",
};

export function libraryTextFieldLabel(field: LibraryTextExportField): string {
  return libraryExportText(FIELD_TEXT_KEYS[field]);
}

function unitLabel(unit: string): string {
  return isReadingProgressUnit(unit) ? progressUnitLabel(unit) : mediaUnitLabel(unit);
}

function fieldValue(row: LibraryTextExportRow, field: LibraryTextExportField): string {
  switch (field) {
    case "entry":
      return row.entryLabel && row.entryUnit
        ? libraryExportText("entryValue", { label: row.entryLabel, unit: progressUnitLabel(row.entryUnit) })
        : "";
    case "mediaType": return MEDIA_UI_LABELS.type[row.mediaType];
    case "originalTitle": return row.originalTitle;
    case "score": return row.score == null ? "" : String(row.score);
    case "progress": {
      const unit = unitLabel(row.progressUnit);
      return row.progressTotal !== undefined && row.progressTotal !== ""
        ? libraryExportText("progressWithTotal", {
          current: row.progressCurrent,
          total: row.progressTotal,
          unit,
        })
        : libraryExportText("progressCurrentOnly", { current: row.progressCurrent, unit });
    }
    case "startedAt": return row.startedAt;
    case "status": return mediaStatusLabel(row.status, row.mediaType);
    case "favorite": return libraryExportText(row.favorite ? "yes" : "no");
    case "genres": return row.genres.join(", ");
  }
}

export function formatLibraryTextExport(
  rows: readonly LibraryTextExportRow[],
  fields: ReadonlySet<LibraryTextExportField>,
): string {
  const selected = LIBRARY_TEXT_EXPORT_FIELDS.filter((field) => fields.has(field));
  const header = [
    libraryExportText("fieldTime"),
    libraryExportText("fieldWork"),
    ...selected.map((field) => libraryTextFieldLabel(field)),
  ];
  const lines = [header.join(" | ")];
  for (const row of rows) {
    lines.push([
      row.time,
      row.work,
      ...selected.map((field) => fieldValue(row, field)),
    ].join(" | "));
  }
  return `${lines.join("\n")}\n`;
}

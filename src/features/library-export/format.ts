import {
  LIBRARY_TEXT_EXPORT_FIELDS,
  type LibraryTextExportField,
  type LibraryTextExportRow,
} from "../../domain/library-export";
import { isReadingProgressUnit } from "../../domain/progress-units";
import { timelineEntryCopy } from "../progress/timeline-entry-text";
import { progressUnitLabel } from "../progress/text";
import { mediaStatusLabel } from "../../ui-text";
import { MEDIA_UI_LABELS, mediaUnitLabel } from "../../ui/ui-helpers";
import { libraryExportText } from "./text";

const FIELD_TEXT_KEYS: Readonly<Record<LibraryTextExportField,
  | "fieldMediaType"
  | "fieldOriginalTitle"
  | "fieldScore"
  | "fieldProgress"
  | "fieldStartedAt"
  | "fieldStatus"
  | "fieldFavorite"
  | "fieldGenres">> = {
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

function eventWorkTitle(row: LibraryTextExportRow): string {
  if (!row.entryLabel || !row.entryUnit) return row.work;
  return timelineEntryCopy(row.work, row.entryLabel, row.entryUnit).title;
}

function fieldValue(row: LibraryTextExportRow, field: LibraryTextExportField): string {
  switch (field) {
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
  const blocks = rows.map((row) => {
    const lines = [row.time, eventWorkTitle(row)];
    for (const field of selected) {
      const value = fieldValue(row, field).trim();
      if (!value) continue;
      lines.push(`  ${libraryExportText("fieldLine", {
        label: libraryTextFieldLabel(field),
        value,
      })}`);
    }
    return lines.join("\n");
  });
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

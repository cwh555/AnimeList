import type { LibraryTextExportRow } from "../../domain/library-export";
import {
  LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS,
  compileLibraryTextTemplate,
  renderLibraryTextTemplate,
  type LibraryTextTemplateCatalog,
  type LibraryTextTemplateCompilation,
  type LibraryTextTemplateIssue,
  type LibraryTextTemplateVariableId,
} from "../../domain/library-text-template";
import { isReadingProgressUnit } from "../../domain/progress-units";
import { timelineEntryCopy } from "../progress/timeline-entry-text";
import { progressUnitLabel } from "../progress/text";
import { mediaStatusLabel } from "../../ui-text";
import { MEDIA_UI_LABELS, mediaUnitLabel } from "../../ui/ui-helpers";
import { libraryExportText } from "./text";

const VARIABLE_TEXT_KEYS: Readonly<Record<LibraryTextTemplateVariableId,
  | "templateVarCompletedAt"
  | "templateVarWork"
  | "templateVarSeriesTitle"
  | "templateVarMediaType"
  | "templateVarUnit"
  | "templateVarOriginalTitle"
  | "templateVarScore"
  | "templateVarProgress"
  | "templateVarStartedAt"
  | "templateVarStatus"
  | "templateVarFavorite"
  | "templateVarGenres">> = {
  completedAt: "templateVarCompletedAt",
  work: "templateVarWork",
  seriesTitle: "templateVarSeriesTitle",
  mediaType: "templateVarMediaType",
  unit: "templateVarUnit",
  originalTitle: "templateVarOriginalTitle",
  score: "templateVarScore",
  progress: "templateVarProgress",
  startedAt: "templateVarStartedAt",
  status: "templateVarStatus",
  favorite: "templateVarFavorite",
  genres: "templateVarGenres",
};

export interface LibraryTextTemplateVariableOption {
  id: LibraryTextTemplateVariableId;
  label: string;
  token: string;
}

function templateCatalog(): LibraryTextTemplateCatalog {
  return {
    names: Object.fromEntries(LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS.map((id) => [
      id,
      libraryExportText(VARIABLE_TEXT_KEYS[id]),
    ])) as Record<LibraryTextTemplateVariableId, string>,
  };
}

export function libraryTextTemplateVariableOptions(): LibraryTextTemplateVariableOption[] {
  const catalog = templateCatalog();
  return LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS.map((id) => ({
    id,
    label: catalog.names[id],
    token: `{$${catalog.names[id]}}`,
  }));
}

export function defaultLibraryTextExportTemplate(): string {
  return libraryExportText("templateDefault");
}

export function compileLibraryTextExportTemplate(template: string): LibraryTextTemplateCompilation {
  return compileLibraryTextTemplate(template, templateCatalog());
}

export function libraryTextTemplateIssueMessage(issue: LibraryTextTemplateIssue): string {
  switch (issue.code) {
    case "empty-template": return libraryExportText("templateErrorEmpty");
    case "template-too-long": return libraryExportText("templateErrorTooLong");
    case "unclosed-variable": return libraryExportText("templateErrorUnclosed");
    case "unknown-variable": return libraryExportText("templateErrorUnknown", { variable: issue.variable ?? "" });
    case "too-many-variables": return libraryExportText("templateErrorTooManyVariables");
    case "missing-completed-at": return libraryExportText("templateErrorMissingCompletedAt");
    case "missing-work": return libraryExportText("templateErrorMissingWork");
  }
}

function unitLabel(unit: string): string {
  return isReadingProgressUnit(unit) ? progressUnitLabel(unit) : mediaUnitLabel(unit);
}

function eventWorkTitle(row: LibraryTextExportRow): string {
  if (!row.entryLabel || !row.entryUnit) return row.work;
  return timelineEntryCopy(row.work, row.entryLabel, row.entryUnit).title;
}

function eventUnitLabel(row: LibraryTextExportRow): string {
  if (!row.entryLabel || !row.entryUnit) return "";
  return timelineEntryCopy(row.work, row.entryLabel, row.entryUnit).label;
}

function progressValue(row: LibraryTextExportRow): string {
  const unit = unitLabel(row.progressUnit);
  return row.progressTotal !== undefined && row.progressTotal !== ""
    ? libraryExportText("progressWithTotal", {
      current: row.progressCurrent,
      total: row.progressTotal,
      unit,
    })
    : libraryExportText("progressCurrentOnly", { current: row.progressCurrent, unit });
}

function templateValues(row: LibraryTextExportRow): Record<LibraryTextTemplateVariableId, string> {
  return {
    completedAt: row.time,
    work: eventWorkTitle(row),
    seriesTitle: row.work,
    mediaType: MEDIA_UI_LABELS.type[row.mediaType],
    unit: eventUnitLabel(row),
    originalTitle: row.originalTitle,
    score: row.score == null ? "" : String(row.score),
    progress: progressValue(row),
    startedAt: row.startedAt,
    status: mediaStatusLabel(row.status, row.mediaType),
    favorite: libraryExportText(row.favorite ? "yes" : "no"),
    genres: row.genres.join(", "),
  };
}

export function formatLibraryTextExport(
  rows: readonly LibraryTextExportRow[],
  template: string,
  compilation = compileLibraryTextExportTemplate(template),
): string {
  if (!compilation.valid) return "";
  const blocks = rows.map((row) => renderLibraryTextTemplate(compilation, templateValues(row)).trimEnd());
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

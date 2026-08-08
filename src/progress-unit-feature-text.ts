import { defineTextCatalog } from "./i18n/catalog";
import { PROGRESS_UNIT_MESSAGES } from "./i18n/locales/zh-TW/progress-unit";
import type { ReadingProgressUnit } from "./progress-units";

const MESSAGES = PROGRESS_UNIT_MESSAGES;

export const PROGRESS_UNIT_FEATURE_TEXT = {
  unit: {
    chapter: MESSAGES["unit.chapter"],
    season: MESSAGES["unit.season"],
    volume: MESSAGES["unit.volume"],
  },
  editorTitle: MESSAGES.editorTitle,
  editorDescriptionInteger: MESSAGES.editorDescriptionInteger,
  editorDescriptionVolume: MESSAGES.editorDescriptionVolume,
  addEntry: MESSAGES.addEntry,
  empty: MESSAGES.empty,
  label: MESSAGES.label,
  labelPlaceholderInteger: MESSAGES.labelPlaceholderInteger,
  labelPlaceholderVolume: MESSAGES.labelPlaceholderVolume,
  startedAt: MESSAGES.startedAt,
  completedAt: MESSAGES.completedAt,
  completedHint: MESSAGES.completedHint,
  remove: MESSAGES.remove,
  invalidInteger: MESSAGES.invalidInteger,
  invalidVolume: MESSAGES.invalidVolume,
  duplicate: MESSAGES.duplicate,
  progressLabel: MESSAGES.progressLabel,
  unitField: MESSAGES.unitField,
  progressHintInteger: MESSAGES.progressHintInteger,
  progressHintVolume: MESSAGES.progressHintVolume,
  timelineEntryTitle: MESSAGES.timelineEntryTitle,
  timelineEntryLabel: MESSAGES.timelineEntryLabel,
} as const;

const CATALOG = defineTextCatalog("progress-unit", MESSAGES);
type TextTemplateKey = Exclude<keyof typeof PROGRESS_UNIT_FEATURE_TEXT, "unit">;
type TextVariables = Record<string, string | number>;

const UNIT_TEXT_KEYS: Record<ReadingProgressUnit, "unit.chapter" | "unit.season" | "unit.volume"> = {
  chapter: "unit.chapter",
  season: "unit.season",
  volume: "unit.volume",
};

export function progressUnitLabel(unit: ReadingProgressUnit): string {
  return CATALOG.text(UNIT_TEXT_KEYS[unit]);
}

export function progressUnitFeatureText(
  key: TextTemplateKey,
  variables: TextVariables = {},
): string {
  return CATALOG.text(key, variables);
}

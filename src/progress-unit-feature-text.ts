import { defineTextCatalog } from "./i18n/catalog";
import type { ReadingProgressUnit } from "./progress-units";

const MESSAGES = {
  "unit.chapter": "話",
  "unit.season": "季",
  "unit.volume": "卷",
  editorTitle: "{unit}紀錄",
  editorDescriptionInteger: "{unit}數支援非負整數；新增{unit}預設今天完成。",
  editorDescriptionVolume: "卷數支援整數、.5、EX；新增卷預設今天完成。",
  addEntry: "新增一{unit}",
  empty: "尚無{unit}紀錄。",
  label: "{unit}數",
  labelPlaceholderInteger: "例如 1、2、3",
  labelPlaceholderVolume: "例如 3、7.5、EX",
  startedAt: "開始日期",
  completedAt: "完成日期",
  completedHint: "未填時使用今天",
  remove: "移除",
  invalidInteger: "{unit}數僅支援非負整數。",
  invalidVolume: "卷數僅支援整數、.5 或 EX。",
  duplicate: "{unit}數 {label} 重複。",
  progressLabel: "目前閱讀{unit}數",
  unitField: "進度單位",
  progressHintInteger: "支援非負整數。",
  progressHintVolume: "支援整數、.5 與 EX。",
  timelineEntryTitle: "{title} — 第 {label} {unit}",
  timelineEntryLabel: "第 {label} {unit}",
} as const;

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

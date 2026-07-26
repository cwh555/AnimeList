import type { ReadingProgressUnit } from "./progress-units";

export const PROGRESS_UNIT_FEATURE_TEXT = {
  unit: {
    chapter: "話",
    season: "季",
    volume: "卷",
  },
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
  progressHintInteger: "支援非負整數。",
  progressHintVolume: "支援整數、.5 與 EX。",
  timelineEntryTitle: "{title} — 第 {label} {unit}",
  timelineEntryLabel: "第 {label} {unit}",
} as const;

type TextTemplateKey = Exclude<keyof typeof PROGRESS_UNIT_FEATURE_TEXT, "unit">;
type TextVariables = Record<string, string | number>;

export function progressUnitLabel(unit: ReadingProgressUnit): string {
  return PROGRESS_UNIT_FEATURE_TEXT.unit[unit];
}

export function progressUnitFeatureText(
  key: TextTemplateKey,
  variables: TextVariables = {},
): string {
  const template = PROGRESS_UNIT_FEATURE_TEXT[key];
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

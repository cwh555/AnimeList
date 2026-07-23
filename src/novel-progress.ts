import { uiText } from "./ui-text";
import type {
  MediaItem,
  NovelVolumeEntry,
  ProgressValue,
  ReleaseStatus,
  TimelineMediaEntry,
} from "./types";

const NUMERIC_VOLUME_PATTERN = /^(?:\d+(?:\.5)?|\.5)$/;

function primitiveText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function normalizeReleaseStatus(value: unknown): ReleaseStatus {
  return value === "releasing"
    || value === "finished"
    || value === "hiatus"
    || value === "cancelled"
    ? value
    : "unknown";
}

export function normalizeVolumeLabel(value: unknown): string | null {
  const text = primitiveText(value).normalize("NFKC").trim().toUpperCase();
  if (text === "EX") return "EX";
  if (!NUMERIC_VOLUME_PATTERN.test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  if (!Number.isInteger(number * 2)) return null;
  return Number.isInteger(number) ? String(number) : String(number);
}

export function volumeSortValue(value: unknown): number {
  const label = normalizeVolumeLabel(value);
  if (label === null) return Number.POSITIVE_INFINITY;
  if (label === "EX") return Number.MAX_SAFE_INTEGER;
  return Number(label);
}

export function compareVolumeLabels(left: unknown, right: unknown): number {
  const difference = volumeSortValue(left) - volumeSortValue(right);
  if (Number.isFinite(difference) && difference !== 0) return difference;
  return primitiveText(left).localeCompare(primitiveText(right), "en", { numeric: true });
}

export function normalizeProgressValue(value: unknown): ProgressValue {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = primitiveText(value).normalize("NFKC").trim();
  if (!text) return 0;
  const label = normalizeVolumeLabel(text);
  if (label !== null) return label === "EX" ? label : Number(label);
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, number) : text;
}

export function progressDisplayValue(value: ProgressValue): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value || "0");
}

export function progressRatio(current: ProgressValue, total: ProgressValue, unit: string): number | null {
  if (unit === "percent") {
    const currentNumber = Number(current);
    return Number.isFinite(currentNumber) ? Math.min(1, Math.max(0, currentNumber / 100)) : null;
  }
  const currentNumber = Number(current);
  const totalNumber = Number(total);
  if (Number.isFinite(currentNumber) && Number.isFinite(totalNumber) && totalNumber > 0) {
    return Math.min(1, Math.max(0, currentNumber / totalNumber));
  }
  const currentLabel = normalizeVolumeLabel(current);
  const totalLabel = normalizeVolumeLabel(total);
  return currentLabel !== null && totalLabel !== null && currentLabel === totalLabel ? 1 : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeVolumeLog(value: unknown): NovelVolumeEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: NovelVolumeEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const record = recordValue(raw);
    if (!record) continue;
    const label = normalizeVolumeLabel(record.label ?? record.volume);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    entries.push({
      label,
      startedAt: stringValue(record.started_at ?? record.startedAt),
      completedAt: stringValue(record.completed_at ?? record.completedAt),
    });
  }
  return entries.sort((left, right) => compareVolumeLabels(left.label, right.label));
}

export function serializeVolumeLog(entries: NovelVolumeEntry[]): Array<Record<string, string>> {
  return normalizeVolumeLog(entries).map((entry) => {
    const serialized: Record<string, string> = { label: entry.label };
    if (entry.startedAt) serialized.started_at = entry.startedAt;
    if (entry.completedAt) serialized.completed_at = entry.completedAt;
    return serialized;
  });
}

export function highestCompletedVolume(entries: NovelVolumeEntry[]): string | null {
  const completed = normalizeVolumeLog(entries).filter((entry) => Boolean(entry.completedAt));
  return completed.length ? completed[completed.length - 1].label : null;
}

export function expandTimelineEntries(items: MediaItem[]): TimelineMediaEntry[] {
  const output: TimelineMediaEntry[] = [];
  for (const item of items) {
    const completedVolumes = item.mediaType === "novel"
      ? normalizeVolumeLog(item.volumeLog).filter((entry) => Boolean(entry.completedAt))
      : [];
    if (completedVolumes.length) {
      for (const volume of completedVolumes) {
        output.push({
          ...item,
          seriesTitle: item.title,
          title: uiText("timeline.novelEventTitle", { title: item.title, volume: volume.label }),
          completedAt: volume.completedAt,
          // Completed novel volumes remain separate timeline events while
          // always reusing the series cover from the library item.
          cover: item.cover,
          volumeLabel: volume.label,
          progressValue: normalizeProgressValue(volume.label),
          progressUnit: "volume",
        });
      }
      continue;
    }
    if (item.status === "completed" && item.completedAt) output.push({ ...item });
  }
  return output;
}

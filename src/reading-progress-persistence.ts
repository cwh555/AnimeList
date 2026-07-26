import { serializeSerialLog, type ReadingProgressUnit } from "./progress-units";
import type { NovelVolumeEntry, ProgressValue } from "./types";

export interface ReadingProgressSnapshot {
  unit: ReadingProgressUnit;
  progress: ProgressValue;
  entries: NovelVolumeEntry[];
}

export function applyReadingProgressSnapshot(
  frontmatter: Record<string, unknown>,
  snapshot: ReadingProgressSnapshot,
): void {
  frontmatter.progress_unit = snapshot.unit;
  frontmatter.progress = snapshot.progress;
  const entries = serializeSerialLog(snapshot.entries, snapshot.unit);
  if (entries.length) frontmatter.volume_log = entries;
  else delete frontmatter.volume_log;
}

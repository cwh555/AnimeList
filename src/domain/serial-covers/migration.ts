import type { MediaType } from "../../types";

export interface MissingSerialCoverRecord {
  filePath: string;
  title: string;
  mediaType: Extract<MediaType, "manga" | "novel">;
  label: string;
}

export interface MissingSerialCoverWork {
  filePath: string;
  title: string;
  mediaType: Extract<MediaType, "manga" | "novel">;
  labels: string[];
}

export function groupMissingSerialCoverRecords(
  records: readonly MissingSerialCoverRecord[],
): MissingSerialCoverWork[] {
  const grouped = new Map<string, MissingSerialCoverWork>();
  for (const record of records) {
    const label = record.label.normalize("NFKC").trim();
    if (!/^\d+(?:\.5)?$/.test(label)) continue;
    const existing = grouped.get(record.filePath);
    if (existing) {
      if (!existing.labels.includes(label)) existing.labels.push(label);
      continue;
    }
    grouped.set(record.filePath, {
      filePath: record.filePath,
      title: record.title,
      mediaType: record.mediaType,
      labels: [label],
    });
  }
  return [...grouped.values()].map((work) => ({
    ...work,
    labels: [...work.labels].sort((left, right) => Number(left) - Number(right)),
  }));
}

export function missingSerialCoverEntryCount(
  works: readonly MissingSerialCoverWork[],
): number {
  return works.reduce((total, work) => total + work.labels.length, 0);
}

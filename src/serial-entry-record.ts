import type { NovelVolumeEntry } from "./types";

const KNOWN_SERIAL_ENTRY_KEYS = new Set([
  "label",
  "volume",
  "started_at",
  "startedAt",
  "completed_at",
  "completedAt",
  "cover",
  "cover_provider",
  "coverProvider",
  "cover_source_id",
  "coverSourceId",
  "cover_manual",
  "coverManual",
  "extra",
]);

function primitiveText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeSerialEntryRecord(
  value: unknown,
  normalizeLabel: (value: unknown) => string | null,
): NovelVolumeEntry | null {
  const record = recordValue(value);
  if (!record) return null;
  const label = normalizeLabel(record.label ?? record.volume);
  if (!label) return null;

  const entry: NovelVolumeEntry = {
    label,
    startedAt: primitiveText(record.started_at ?? record.startedAt),
    completedAt: primitiveText(record.completed_at ?? record.completedAt),
  };
  const cover = primitiveText(record.cover).trim();
  const coverProvider = primitiveText(record.cover_provider ?? record.coverProvider).trim();
  const coverSourceId = primitiveText(record.cover_source_id ?? record.coverSourceId).trim();
  if (cover) entry.cover = cover;
  if (coverProvider) entry.coverProvider = coverProvider;
  if (coverSourceId) entry.coverSourceId = coverSourceId;
  if (record.cover_manual === true || record.coverManual === true) entry.coverManual = true;

  const storedExtra = recordValue(record.extra) ?? {};
  const extra = {
    ...storedExtra,
    ...Object.fromEntries(
      Object.entries(record).filter(([key]) => !KNOWN_SERIAL_ENTRY_KEYS.has(key)),
    ),
  };
  if (Object.keys(extra).length) entry.extra = extra;
  return entry;
}

export function serializeSerialEntryRecord(entry: NovelVolumeEntry): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...(entry.extra ?? {}),
    label: entry.label,
  };
  if (entry.startedAt) serialized.started_at = entry.startedAt;
  if (entry.completedAt) serialized.completed_at = entry.completedAt;
  if (entry.cover) serialized.cover = entry.cover;
  if (entry.coverProvider) serialized.cover_provider = entry.coverProvider;
  if (entry.coverSourceId) serialized.cover_source_id = entry.coverSourceId;
  if (entry.coverManual) serialized.cover_manual = true;
  return serialized;
}

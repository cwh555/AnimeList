export const LIBRARY_VIEW_MODES = ["grid", "list", "poster"] as const;
export type LibraryViewMode = (typeof LIBRARY_VIEW_MODES)[number];
export type LibraryColumnView = Exclude<LibraryViewMode, "list">;

export const DEFAULT_LIBRARY_LAYOUT_COLUMNS = 3;
export const MIN_LIBRARY_LAYOUT_COLUMNS = 1;
export const MAX_LIBRARY_LAYOUT_COLUMNS = 6;

export interface LibraryLayoutColumns {
  grid: number;
  poster: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeLibraryLayoutColumnCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LIBRARY_LAYOUT_COLUMNS;
  return Math.min(
    MAX_LIBRARY_LAYOUT_COLUMNS,
    Math.max(MIN_LIBRARY_LAYOUT_COLUMNS, Math.round(numeric)),
  );
}

export function normalizeLibraryLayoutColumns(value: unknown): LibraryLayoutColumns {
  const record = isRecord(value) ? value : {};
  return {
    grid: normalizeLibraryLayoutColumnCount(record.grid),
    poster: normalizeLibraryLayoutColumnCount(record.poster),
  };
}

export function libraryColumnsForView(
  columns: LibraryLayoutColumns,
  view: LibraryViewMode,
): number | null {
  return view === "list" ? null : columns[view];
}

export function libraryLayoutColumnsWithView(
  columns: LibraryLayoutColumns,
  view: LibraryColumnView,
  value: unknown,
): LibraryLayoutColumns {
  return {
    ...columns,
    [view]: normalizeLibraryLayoutColumnCount(value),
  };
}

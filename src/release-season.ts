export type ReleaseSeasonMonth = 1 | 4 | 7 | 10;

export function normalizeReleaseSeasonMonth(value: unknown): ReleaseSeasonMonth | "" {
  const month = Number(value);
  if (!Number.isFinite(month) || month < 1 || month > 12) return "";
  if (month <= 3) return 1;
  if (month <= 6) return 4;
  if (month <= 9) return 7;
  return 10;
}

export function releaseSeasonLabel(value: unknown): string {
  const season = normalizeReleaseSeasonMonth(value);
  if (season === 1) return "冬季";
  if (season === 4) return "春季";
  if (season === 7) return "夏季";
  if (season === 10) return "秋季";
  return "";
}

export function releaseDateMetadata(
  year: unknown,
  month: unknown,
): { year: number | ""; season: ReleaseSeasonMonth | "" } {
  const parsedYear = Number(year);
  return {
    year: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : "",
    season: normalizeReleaseSeasonMonth(month),
  };
}

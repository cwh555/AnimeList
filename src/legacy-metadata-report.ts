import type { LegacyMetadataCleanupDetail, LegacyMetadataCleanupResult } from "./domain/legacy-metadata-types";

function enrichmentSuffix(detail: LegacyMetadataCleanupDetail): string {
  if (detail.enrichment === "unavailable") return "AniList: no reliable match";
  if (detail.enrichment === "failed") return `AniList failed${detail.error ? `: ${detail.error}` : ""}`;
  return "";
}

export function legacyMetadataDetailLine(detail: LegacyMetadataCleanupDetail): string {
  const parts = [`${detail.title} (${detail.path})`];
  if (detail.changes.length) parts.push(`changed: ${detail.changes.join(", ")}`);
  const enrichment = enrichmentSuffix(detail);
  if (enrichment) parts.push(enrichment);
  return parts.join(" — ");
}

export function legacyMetadataDetailReport(summary: LegacyMetadataCleanupResult): string {
  return summary.details.map(legacyMetadataDetailLine).join("\n");
}

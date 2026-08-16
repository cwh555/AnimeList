import type { LegacyMetadataCleanupDetail, LegacyMetadataCleanupResult } from "./domain/legacy-metadata-types";
import { legacyMetadataText } from "./legacy-metadata-text";

function enrichmentSuffix(detail: LegacyMetadataCleanupDetail): string {
  if (detail.enrichment === "unavailable") return legacyMetadataText("report.noMatch");
  if (detail.enrichment === "failed") {
    return legacyMetadataText("report.failed", { detail: detail.error ? `: ${detail.error}` : "" });
  }
  return "";
}

export function legacyMetadataDetailLine(detail: LegacyMetadataCleanupDetail): string {
  const parts = [`${detail.title} (${detail.path})`];
  if (detail.changes.length) {
    parts.push(legacyMetadataText("report.changed", { fields: detail.changes.join(", ") }));
  }
  const enrichment = enrichmentSuffix(detail);
  if (enrichment) parts.push(enrichment);
  return parts.join(" — ");
}

export function legacyMetadataDetailReport(summary: LegacyMetadataCleanupResult): string {
  return summary.details.map(legacyMetadataDetailLine).join("\n");
}

import type { ReleaseTrackingSnapshot } from "../../domain/release-tracking";
import { releaseTrackingText } from "./text";

export function providerLabel(snapshot: ReleaseTrackingSnapshot): string {
  if (snapshot.sourceLabel) return snapshot.sourceLabel;
  return snapshot.binding?.provider === "mangadex"
    ? releaseTrackingText("provider.mangadex")
    : snapshot.binding?.provider === "ndl-jpro"
      ? releaseTrackingText("provider.ndl")
      : "";
}

export function attentionLabel(status: ReleaseTrackingSnapshot["status"]): string {
  if (status === "ambiguous") return releaseTrackingText("status.ambiguous");
  if (status === "unmatched") return releaseTrackingText("status.unmatched");
  if (status === "provider_error") return releaseTrackingText("status.provider_error");
  if (status === "source_regressed") return releaseTrackingText("status.source_regressed");
  return releaseTrackingText("status.unconfigured");
}

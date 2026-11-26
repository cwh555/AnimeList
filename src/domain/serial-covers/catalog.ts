import type { ExternalMediaSourceRef } from "../media-types";
import type { SerialCoverCandidate } from "./ranking";

export interface VolumeCatalogRequest {
  mediaType: "manga" | "novel";
  originalTitle: string;
  aliases: readonly string[];
  sources: readonly ExternalMediaSourceRef[];
  queryTitle: string;
  label: string;
  manual: boolean;
}

export interface VolumeCatalogResult {
  verified: SerialCoverCandidate[];
  alternatives: SerialCoverCandidate[];
  warnings: string[];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function seriesIdentity(title: string): string {
  return normalized(title).replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Match a volume suffix relative to a known series title; never treat an arbitrary digit as the volume. */
export function matchesCatalogVolume(title: string, aliases: readonly string[], label: string): boolean {
  if (!/^\d+(?:\.5)?$/.test(label)) return false;
  const value = normalized(title);
  for (const alias of aliases) {
    const prefix = normalized(alias);
    if (!prefix || !value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    const match = /^\s*[:：\-]?\s*(?:vol(?:ume)?\.?\s*|第\s*)?\(?\s*(\d+(?:\.5)?)\s*(?:巻|卷|冊|册)?\s*\)?\s*(?:(?::|：)\s*[^\d].*)?$/u.exec(suffix);
    if (match && Number(match[1]) === Number(label)) return true;
  }
  return false;
}

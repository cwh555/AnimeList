import { requestUrl } from "obsidian";
import {
  rankSerialCoverCandidates,
  type RankedSerialCoverCandidate,
  type SerialCoverCandidate,
} from "./serial-entry-cover";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function googleBookCandidate(value: unknown): SerialCoverCandidate | null {
  const item = record(value);
  const info = record(item?.volumeInfo);
  const images = record(info?.imageLinks);
  const coverUrl = text(images?.extraLarge) || text(images?.large) || text(images?.medium) || text(images?.thumbnail);
  const title = [text(info?.title), text(info?.subtitle)].filter(Boolean).join(" ");
  if (!item || !title || !coverUrl) return null;
  return {
    provider: "Google Books",
    sourceId: text(item.id),
    title,
    coverUrl: coverUrl.replace(/^http:/, "https:"),
    infoUrl: text(info?.infoLink),
  };
}

export async function searchSerialCovers(
  query: string,
  originalTitle: string,
  label: string,
): Promise<RankedSerialCoverCandidate[]> {
  const response = await requestUrl({
    url: `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books`,
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = record(response.json ?? JSON.parse(response.text || "{}"));
  const candidates = asArray(payload?.items)
    .map(googleBookCandidate)
    .filter((candidate): candidate is SerialCoverCandidate => candidate !== null);
  return rankSerialCoverCandidates(candidates, originalTitle, label);
}

import type { App } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import {
  compareChapterLabels,
  groupPublicationLines,
  normalizeTrackingText,
  providerResultRegressed,
  selectLatestPublishedRecord,
  type NdlPublicationLine,
  type ReleaseTrackingBinding,
  type ReleaseTrackingStatus,
} from "../domain/release-tracking";
import { MangaDexReleaseClient, type MangaDexSeriesCandidate } from "./providers/mangadex-release-client";
import { NdlReleaseClient } from "./providers/ndl-release-client";
import { ReleaseTrackingStateService } from "./release-tracking-state-service";

export type ReleaseRefreshKind = "updated" | "unchanged" | "initialized" | "attention" | "skipped";

export interface ReleaseRefreshItemResult {
  item: MediaItem;
  kind: ReleaseRefreshKind;
  before: string;
  after: string;
  provider: "mangadex" | "ndl-jpro" | "";
  status: ReleaseTrackingStatus;
  message: string;
  sourceUrl: string;
}

export interface ReleaseRefreshSummary {
  results: ReleaseRefreshItemResult[];
  checked: number;
  updated: number;
  unchanged: number;
  initialized: number;
  attention: number;
}

export type ReleaseMatchCandidate =
  | { provider: "mangadex"; label: string; description: string; sourceUrl: string; binding: ReleaseTrackingBinding }
  | { provider: "ndl-jpro"; label: string; description: string; sourceUrl: string; binding: ReleaseTrackingBinding };

export interface ReleaseTrackingClients {
  mangaDex?: MangaDexReleaseClient;
  ndl?: NdlReleaseClient;
}

function itemTitles(item: MediaItem): string[] {
  return [...new Set([item.originalTitle, item.title].map((value) => value.trim()).filter(Boolean))];
}

function mangaCandidateTitles(candidate: MangaDexSeriesCandidate): string[] {
  return [candidate.title, ...candidate.altTitles];
}

function exactMangaCandidates(
  candidates: readonly MangaDexSeriesCandidate[],
  titles: readonly string[],
): MangaDexSeriesCandidate[] {
  const expected = new Set(titles.map(normalizeTrackingText).filter(Boolean));
  return candidates.filter((candidate) => mangaCandidateTitles(candidate)
    .map(normalizeTrackingText)
    .some((value) => value && expected.has(value)));
}

function lineBinding(line: NdlPublicationLine): ReleaseTrackingBinding {
  return {
    provider: "ndl-jpro",
    title: line.title,
    creator: line.creator || undefined,
    publisher: line.publisher || undefined,
  };
}

function lineDescription(line: NdlPublicationLine): string {
  return [line.creator, line.publisher].filter(Boolean).join(" · ");
}

export class ReleaseTrackingService {
  readonly state: ReleaseTrackingStateService;
  private readonly mangaDex: MangaDexReleaseClient;
  private readonly ndl: NdlReleaseClient;

  constructor(app: App, clients: ReleaseTrackingClients = {}) {
    this.state = new ReleaseTrackingStateService(app);
    this.mangaDex = clients.mangaDex ?? new MangaDexReleaseClient();
    this.ndl = clients.ndl ?? new NdlReleaseClient();
  }

  private async mangaSearchCandidates(item: MediaItem): Promise<MangaDexSeriesCandidate[]> {
    const byId = new Map<string, MangaDexSeriesCandidate>();
    for (const title of itemTitles(item)) {
      for (const candidate of await this.mangaDex.search(title)) byId.set(candidate.id, candidate);
    }
    return [...byId.values()];
  }

  private async discoverMangaBinding(item: MediaItem): Promise<{
    binding: ReleaseTrackingBinding | null;
    status: "ambiguous" | "unmatched" | "unconfigured";
    message: string;
  }> {
    const candidates = await this.mangaSearchCandidates(item);
    const exact = exactMangaCandidates(candidates, itemTitles(item));
    if (exact.length === 1) {
      return {
        binding: { provider: "mangadex", sourceId: exact[0].id, title: exact[0].title },
        status: "unconfigured",
        message: "",
      };
    }
    if (exact.length > 1) return { binding: null, status: "ambiguous", message: "Multiple exact MangaDex titles matched." };
    return { binding: null, status: "unmatched", message: "No safe MangaDex title match was found." };
  }

  private async novelLines(item: MediaItem, creator = ""): Promise<NdlPublicationLine[]> {
    const records = await this.ndl.searchTitles(itemTitles(item), creator);
    return groupPublicationLines(records, itemTitles(item));
  }

  private async discoverNovelBinding(item: MediaItem): Promise<{
    binding: ReleaseTrackingBinding | null;
    status: "ambiguous" | "unmatched" | "unconfigured";
    message: string;
  }> {
    const lines = await this.novelLines(item);
    if (lines.length > 0) {
      return {
        binding: null,
        status: "ambiguous",
        message: lines.length === 1
          ? "An NDL/JPRO publication line was found but requires confirmation before writing the latest volume."
          : "Multiple NDL/JPRO publication lines matched and require confirmation.",
      };
    }
    return { binding: null, status: "unmatched", message: "No safe NDL/JPRO publication line was found." };
  }

  private attention(
    item: MediaItem,
    provider: "mangadex" | "ndl-jpro" | "",
    status: ReleaseTrackingStatus,
    message: string,
  ): ReleaseRefreshItemResult {
    const current = this.state.read(item.filePath, item.mediaType);
    return {
      item,
      kind: "attention",
      before: current.latest,
      after: current.latest,
      provider,
      status,
      message,
      sourceUrl: this.state.sourceUrl(item.filePath),
    };
  }

  private async refreshManga(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<ReleaseRefreshItemResult> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    if (binding?.provider !== "mangadex" || !binding.sourceId) {
      const discovered = await this.discoverMangaBinding(item);
      if (!discovered.binding) {
        await this.state.writeAttention(item.filePath, item.mediaType, discovered.status, discovered.message);
        return this.attention(item, "mangadex", discovered.status, discovered.message);
      }
      binding = discovered.binding;
    }
    const latest = await this.mangaDex.latestChapter(binding.sourceId);
    if (!latest) {
      const message = "MangaDex returned no numeric chapter that can be safely tracked.";
      await this.state.writeAttention(item.filePath, item.mediaType, "unmatched", message);
      return this.attention(item, "mangadex", "unmatched", message);
    }
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest, "", "mangadex")) {
      const message = `MangaDex returned ${latest}, older than the stored ${current.latest}; the stored value was preserved.`;
      await this.state.writeAttention(item.filePath, item.mediaType, "source_regressed", message);
      return this.attention(item, "mangadex", "source_regressed", message);
    }
    const changed = Boolean(current.latest) && compareChapterLabels(latest, current.latest) > 0;
    const initialized = !current.latest;
    await this.state.writeVerified(
      item.filePath,
      item.mediaType,
      binding,
      latest,
      "",
      `https://mangadex.org/title/${encodeURIComponent(binding.sourceId)}`,
    );
    return {
      item,
      kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
      before: current.latest,
      after: latest,
      provider: "mangadex",
      status: "verified",
      message: "",
      sourceUrl: `https://mangadex.org/title/${encodeURIComponent(binding.sourceId)}`,
    };
  }

  private async refreshNovel(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<ReleaseRefreshItemResult> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    if (binding?.provider !== "ndl-jpro" || !binding.title) {
      const discovered = await this.discoverNovelBinding(item);
      if (!discovered.binding) {
        await this.state.writeAttention(item.filePath, item.mediaType, discovered.status, discovered.message);
        return this.attention(item, "ndl-jpro", discovered.status, discovered.message);
      }
      binding = discovered.binding;
    }
    const records = await this.ndl.searchTitles([binding.title], binding.creator ?? "");
    const latest = selectLatestPublishedRecord(records, binding, new Date());
    if (!latest) {
      const message = "NDL/JPRO returned no published volume for the verified publication line.";
      await this.state.writeAttention(item.filePath, item.mediaType, "unmatched", message);
      return this.attention(item, "ndl-jpro", "unmatched", message);
    }
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest.volume, latest.publishedAt, "ndl-jpro")) {
      const message = `NDL/JPRO returned an older publication than the stored ${current.latest}; the stored value was preserved.`;
      await this.state.writeAttention(item.filePath, item.mediaType, "source_regressed", message);
      return this.attention(item, "ndl-jpro", "source_regressed", message);
    }
    const initialized = !current.latest;
    const changed = Boolean(current.latest) && current.latest !== latest.volume;
    await this.state.writeVerified(
      item.filePath,
      item.mediaType,
      binding,
      latest.volume,
      latest.publishedAt,
      latest.sourceUrl,
    );
    return {
      item,
      kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
      before: current.latest,
      after: latest.volume,
      provider: "ndl-jpro",
      status: "verified",
      message: "",
      sourceUrl: latest.sourceUrl,
    };
  }

  async refreshItem(item: MediaItem, binding?: ReleaseTrackingBinding): Promise<ReleaseRefreshItemResult> {
    if (item.mediaType === "anime") {
      return { item, kind: "skipped", before: "", after: "", provider: "", status: "unconfigured", message: "", sourceUrl: "" };
    }
    const current = this.state.read(item.filePath, item.mediaType);
    if (!binding && current.status === "disabled") {
      return { item, kind: "skipped", before: current.latest, after: current.latest, provider: "", status: "disabled", message: "", sourceUrl: this.state.sourceUrl(item.filePath) };
    }
    try {
      return item.mediaType === "manga"
        ? await this.refreshManga(item, binding)
        : await this.refreshNovel(item, binding);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.state.writeAttention(item.filePath, item.mediaType, "provider_error", message);
      return this.attention(item, item.mediaType === "manga" ? "mangadex" : "ndl-jpro", "provider_error", message);
    }
  }

  async refreshAll(
    items: readonly MediaItem[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<ReleaseRefreshSummary> {
    const trackable = items.filter((item) => item.mediaType === "manga" || item.mediaType === "novel");
    const results: ReleaseRefreshItemResult[] = [];
    for (let index = 0; index < trackable.length; index += 1) {
      results.push(await this.refreshItem(trackable[index]));
      onProgress?.(index + 1, trackable.length);
    }
    return {
      results,
      checked: results.filter((result) => result.kind !== "skipped").length,
      updated: results.filter((result) => result.kind === "updated").length,
      unchanged: results.filter((result) => result.kind === "unchanged").length,
      initialized: results.filter((result) => result.kind === "initialized").length,
      attention: results.filter((result) => result.kind === "attention").length,
    };
  }

  async matchCandidates(item: MediaItem): Promise<ReleaseMatchCandidate[]> {
    if (item.mediaType === "manga") {
      return (await this.mangaSearchCandidates(item)).map((candidate) => ({
        provider: "mangadex" as const,
        label: candidate.title,
        description: candidate.altTitles.slice(0, 3).join(" · "),
        sourceUrl: candidate.sourceUrl,
        binding: { provider: "mangadex" as const, sourceId: candidate.id, title: candidate.title },
      }));
    }
    if (item.mediaType === "novel") {
      return (await this.novelLines(item)).map((line) => ({
        provider: "ndl-jpro" as const,
        label: line.title,
        description: lineDescription(line),
        sourceUrl: line.records.find((record) => record.sourceUrl)?.sourceUrl ?? "",
        binding: lineBinding(line),
      }));
    }
    return [];
  }
}

import type { App } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import {
  compareChapterLabels,
  groupPublicationLines,
  normalizeTrackingText,
  numericChapterParts,
  providerResultRegressed,
  selectLatestPublishedRecord,
  selectSafeNovelPublicationLine,
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

export interface ReleaseRefreshProgress {
  completed: number;
  total: number;
  item: MediaItem;
  provider: "mangadex" | "ndl-jpro";
  stage: "checking" | "completed";
}

export type ReleaseMatchCandidate =
  | { provider: "mangadex"; label: string; description: string; sourceUrl: string; binding: ReleaseTrackingBinding }
  | { provider: "ndl-jpro"; label: string; description: string; sourceUrl: string; binding: ReleaseTrackingBinding };

export interface ReleaseTrackingClients {
  mangaDex?: MangaDexReleaseClient;
  ndl?: NdlReleaseClient;
}

interface PreparedReleaseRefresh {
  result: ReleaseRefreshItemResult;
  persist(): Promise<void>;
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

function isMangaVariant(candidate: MangaDexSeriesCandidate): boolean {
  return /(fan\s*colou?red|official\s*colou?red|colou?red|doujinshi|anthology|pre-serialization|spin.?off|gaiden|外伝|アンソロジ)/i
    .test(candidate.title);
}

function lineBinding(line: NdlPublicationLine): ReleaseTrackingBinding {
  return {
    provider: "ndl-jpro",
    title: line.title,
    creator: line.creator || undefined,
    publisher: line.publisher || undefined,
    imprint: line.imprint || undefined,
  };
}

function lineDescription(line: NdlPublicationLine): string {
  return [line.creator, line.imprint, line.publisher].filter(Boolean).join(" · ");
}

function providerBehindReadingProgress(item: MediaItem, latest: string): boolean {
  const expectedUnit = item.mediaType === "manga" ? "chapter" : item.mediaType === "novel" ? "volume" : "";
  if (!expectedUnit || item.unit !== expectedUnit) return false;
  if (!numericChapterParts(item.progress) || !numericChapterParts(latest)) return false;
  return compareChapterLabels(latest, item.progress) < 0;
}

function providerNameForItem(item: MediaItem): "mangadex" | "ndl-jpro" {
  return item.mediaType === "manga" ? "mangadex" : "ndl-jpro";
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
    const clean = exact.filter((candidate) => !isMangaVariant(candidate));
    const selected = clean.length === 1 ? clean[0] : exact.length === 1 ? exact[0] : null;
    if (selected) {
      return {
        binding: { provider: "mangadex", sourceId: selected.id, title: selected.title },
        status: "unconfigured",
        message: "",
      };
    }
    if (exact.length > 1) return { binding: null, status: "ambiguous", message: "Multiple exact MangaDex editions matched." };
    return { binding: null, status: "unmatched", message: "No safe MangaDex title match was found." };
  }

  private async novelRecords(item: MediaItem): Promise<Awaited<ReturnType<NdlReleaseClient["searchTitles"]>>> {
    const creator = item.people.find((value) => value.trim()) ?? "";
    if (creator) {
      const filtered = await this.ndl.searchTitles(itemTitles(item), creator);
      if (filtered.length) return filtered;
    }
    return this.ndl.searchTitles(itemTitles(item));
  }

  private async novelLines(item: MediaItem): Promise<NdlPublicationLine[]> {
    const records = await this.novelRecords(item);
    return groupPublicationLines(records, itemTitles(item), item.people);
  }

  private async discoverNovelBinding(item: MediaItem): Promise<{
    binding: ReleaseTrackingBinding | null;
    status: "ambiguous" | "unmatched" | "unconfigured";
    message: string;
  }> {
    const lines = await this.novelLines(item);
    const selected = selectSafeNovelPublicationLine(lines, item.people.some((value) => value.trim()));
    if (selected) return { binding: lineBinding(selected), status: "unconfigured", message: "" };
    if (lines.length > 0) {
      return {
        binding: null,
        status: "ambiguous",
        message: "Multiple plausible NDL/JPRO publication lines remain after title, author, and imprint checks.",
      };
    }
    return { binding: null, status: "unmatched", message: "No safe NDL/JPRO publication line was found." };
  }

  private preparedAttention(
    item: MediaItem,
    provider: "mangadex" | "ndl-jpro" | "",
    status: Exclude<ReleaseTrackingStatus, "verified" | "disabled">,
    message: string,
  ): PreparedReleaseRefresh {
    const current = this.state.read(item.filePath, item.mediaType);
    return {
      result: {
        item,
        kind: "attention",
        before: current.latest,
        after: current.latest,
        provider,
        status,
        message,
        sourceUrl: this.state.sourceUrl(item.filePath),
      },
      persist: async () => {
        await this.state.writeAttention(item.filePath, item.mediaType, status, message);
      },
    };
  }

  private async prepareManga(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    if (binding?.provider !== "mangadex" || !binding.sourceId) {
      const discovered = await this.discoverMangaBinding(item);
      if (!discovered.binding) {
        return this.preparedAttention(item, "mangadex", discovered.status, discovered.message);
      }
      binding = discovered.binding;
    }
    if (binding.provider !== "mangadex" || !binding.sourceId) {
      throw new Error("MangaDex binding is incomplete.");
    }
    const latest = await this.mangaDex.latestChapter(binding.sourceId);
    if (!latest) {
      return this.preparedAttention(
        item,
        "mangadex",
        "unmatched",
        "MangaDex returned no numeric chapter that can be safely tracked.",
      );
    }
    if (providerBehindReadingProgress(item, latest)) {
      return this.preparedAttention(
        item,
        "mangadex",
        "source_regressed",
        `MangaDex returned Ch.${latest}, below the recorded reading progress Ch.${item.progress}; no latest value was changed.`,
      );
    }
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest, "", "mangadex")) {
      return this.preparedAttention(
        item,
        "mangadex",
        "source_regressed",
        `MangaDex returned ${latest}, older than the stored ${current.latest}; the stored value was preserved.`,
      );
    }
    const changed = Boolean(current.latest) && compareChapterLabels(latest, current.latest) > 0;
    const initialized = !current.latest;
    const sourceUrl = `https://mangadex.org/title/${encodeURIComponent(binding.sourceId)}`;
    const result: ReleaseRefreshItemResult = {
      item,
      kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
      before: current.latest,
      after: latest,
      provider: "mangadex",
      status: "verified",
      message: "",
      sourceUrl,
    };
    return {
      result,
      persist: async () => {
        await this.state.writeVerified(item.filePath, item.mediaType, binding, latest, "", sourceUrl);
      },
    };
  }

  private async prepareNovel(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    if (binding?.provider !== "ndl-jpro" || !binding.title) {
      const discovered = await this.discoverNovelBinding(item);
      if (!discovered.binding) {
        return this.preparedAttention(item, "ndl-jpro", discovered.status, discovered.message);
      }
      binding = discovered.binding;
    }
    if (binding.provider !== "ndl-jpro" || !binding.title) {
      throw new Error("NDL/JPRO binding is incomplete.");
    }
    let records = await this.ndl.searchTitles([binding.title], binding.creator ?? "");
    if (!records.length && binding.creator) records = await this.ndl.searchTitles([binding.title]);
    const latest = selectLatestPublishedRecord(records, binding, new Date());
    if (!latest) {
      return this.preparedAttention(
        item,
        "ndl-jpro",
        "unmatched",
        "NDL/JPRO returned no published volume for the verified publication line.",
      );
    }
    if (providerBehindReadingProgress(item, latest.volume)) {
      return this.preparedAttention(
        item,
        "ndl-jpro",
        "source_regressed",
        `NDL/JPRO returned Vol.${latest.volume}, below the recorded reading progress Vol.${item.progress}; no latest value was changed.`,
      );
    }
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest.volume, latest.publishedAt, "ndl-jpro")) {
      return this.preparedAttention(
        item,
        "ndl-jpro",
        "source_regressed",
        `NDL/JPRO returned an older publication than the stored ${current.latest}; the stored value was preserved.`,
      );
    }
    const initialized = !current.latest;
    const changed = Boolean(current.latest) && current.latest !== latest.volume;
    const result: ReleaseRefreshItemResult = {
      item,
      kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
      before: current.latest,
      after: latest.volume,
      provider: "ndl-jpro",
      status: "verified",
      message: "",
      sourceUrl: latest.sourceUrl,
    };
    return {
      result,
      persist: async () => {
        await this.state.writeVerified(
          item.filePath,
          item.mediaType,
          binding,
          latest.volume,
          latest.publishedAt,
          latest.sourceUrl,
        );
      },
    };
  }

  private async prepareItem(item: MediaItem, binding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    if (item.mediaType === "anime") {
      return {
        result: { item, kind: "skipped", before: "", after: "", provider: "", status: "unconfigured", message: "", sourceUrl: "" },
        persist: async () => {},
      };
    }
    const current = this.state.read(item.filePath, item.mediaType);
    if (!binding && current.status === "disabled") {
      return {
        result: { item, kind: "skipped", before: current.latest, after: current.latest, provider: "", status: "disabled", message: "", sourceUrl: this.state.sourceUrl(item.filePath) },
        persist: async () => {},
      };
    }
    try {
      return item.mediaType === "manga"
        ? await this.prepareManga(item, binding)
        : await this.prepareNovel(item, binding);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.preparedAttention(
        item,
        item.mediaType === "manga" ? "mangadex" : "ndl-jpro",
        "provider_error",
        message,
      );
    }
  }

  async refreshItem(item: MediaItem, binding?: ReleaseTrackingBinding): Promise<ReleaseRefreshItemResult> {
    const prepared = await this.prepareItem(item, binding);
    await prepared.persist();
    return prepared.result;
  }

  async refreshAll(
    items: readonly MediaItem[],
    onProgress?: (progress: ReleaseRefreshProgress) => void,
  ): Promise<ReleaseRefreshSummary> {
    const trackable = items.filter((item) => item.mediaType === "manga" || item.mediaType === "novel");
    const prepared: PreparedReleaseRefresh[] = [];
    for (let index = 0; index < trackable.length; index += 1) {
      const item = trackable[index];
      const provider = providerNameForItem(item);
      onProgress?.({ completed: index, total: trackable.length, item, provider, stage: "checking" });
      prepared.push(await this.prepareItem(item));
      onProgress?.({ completed: index + 1, total: trackable.length, item, provider, stage: "completed" });
    }

    // Provider requests are intentionally completed before any note is written.
    // This keeps the Library stable throughout the visible network check; the
    // final local frontmatter writes then happen as one compact burst and the
    // existing Library render debounce collapses their metadata events.
    for (const entry of prepared) await entry.persist();

    const results = prepared.map((entry) => entry.result);
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
      return (await this.novelLines(item))
        .filter((line) => line.medium !== "comic")
        .map((line) => ({
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

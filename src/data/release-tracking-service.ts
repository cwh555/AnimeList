import type { App } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import {
  compareChapterLabels,
  groupPublicationLines,
  mergeCompatibleNovelPublicationLines,
  normalizeTrackingText,
  numericChapterParts,
  providerResultRegressed,
  selectLatestPublishedRecord,
  selectSafeNovelPublicationLine,
  sidePublicationsAfter,
  type NdlCatalog,
  type NdlPublicationLine,
  type NdlPublicationRecord,
  type ReleaseTrackingBinding,
  type ReleaseTrackingStatus,
} from "../domain/release-tracking";
import { MangaDexReleaseClient, type MangaDexSeriesCandidate } from "./providers/mangadex-release-client";
import { NDL_CATALOGS, NdlReleaseClient } from "./providers/ndl-release-client";
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
  notes: string[];
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

interface NovelCatalogEvaluation {
  catalog: NdlCatalog;
  records: NdlPublicationRecord[];
  lines: NdlPublicationLine[];
  safeLine: NdlPublicationLine | null;
  latest: NdlPublicationRecord | null;
}

interface NovelDiscoveryCache {
  candidates: ReleaseMatchCandidate[];
  recordsByCatalog: Map<NdlCatalog, NdlPublicationRecord[]>;
}

function itemTitles(item: MediaItem): string[] {
  return [...new Set([item.originalTitle, item.title].map((value) => value.trim()).filter(Boolean))];
}

function discoveryTitles(item: MediaItem): string[] {
  const original = item.originalTitle.trim();
  const localized = item.title.trim();
  return [...new Set([original, localized].filter(Boolean))];
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

function preferredCatalog(line: NdlPublicationLine): NdlCatalog | undefined {
  return line.records.find((record) => record.catalog === "jpro-book")?.catalog
    ?? line.records.find((record) => record.catalog)?.catalog;
}

function lineBinding(line: NdlPublicationLine, catalog = preferredCatalog(line)): ReleaseTrackingBinding {
  return {
    provider: "ndl-jpro",
    title: line.title,
    creator: line.creator || undefined,
    publisher: line.publisher || undefined,
    imprint: line.imprint || undefined,
    catalog,
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

function catalogOrder(preferred?: NdlCatalog): NdlCatalog[] {
  return preferred
    ? [preferred, ...NDL_CATALOGS.filter((catalog) => catalog !== preferred)]
    : [...NDL_CATALOGS];
}

function sidePublicationLabel(record: NdlPublicationRecord): string {
  const title = record.title.trim();
  const volume = record.volume.trim();
  const volumeAlreadyInTitle = volume && normalizeTrackingText(title).endsWith(normalizeTrackingText(volume));
  return [volumeAlreadyInTitle ? title : [title, volume].filter(Boolean).join(" "), record.publishedAt]
    .filter(Boolean)
    .join(" · ");
}

export class ReleaseTrackingService {
  readonly state: ReleaseTrackingStateService;
  private readonly mangaDex: MangaDexReleaseClient;
  private readonly ndl: NdlReleaseClient;
  private readonly matchCache = new Map<string, NovelDiscoveryCache | ReleaseMatchCandidate[]>();

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
    const matchCandidates = candidates.map((candidate) => ({
      provider: "mangadex" as const,
      label: candidate.title,
      description: candidate.altTitles.slice(0, 3).join(" · "),
      sourceUrl: candidate.sourceUrl,
      binding: { provider: "mangadex" as const, sourceId: candidate.id, title: candidate.title },
    }));
    this.matchCache.set(item.filePath, matchCandidates);
    if (exact.length > 1) return { binding: null, status: "ambiguous", message: "Multiple exact MangaDex editions matched." };
    return { binding: null, status: "unmatched", message: "No safe MangaDex title match was found." };
  }

  private linesFromRecords(item: MediaItem, records: readonly NdlPublicationRecord[], titles: readonly string[]): NdlPublicationLine[] {
    return mergeCompatibleNovelPublicationLines(groupPublicationLines(records, titles, item.people));
  }

  private evaluateNovelCatalog(
    item: MediaItem,
    catalog: NdlCatalog,
    records: NdlPublicationRecord[],
    titles: readonly string[],
  ): NovelCatalogEvaluation {
    const lines = this.linesFromRecords(item, records, titles);
    const safeLine = selectSafeNovelPublicationLine(lines, item.people.some((value) => value.trim()));
    const binding = safeLine ? lineBinding(safeLine, catalog) : null;
    const latest = binding ? selectLatestPublishedRecord(records, binding, new Date()) : null;
    return { catalog, records, lines, safeLine, latest };
  }

  private novelCandidate(line: NdlPublicationLine, catalog?: NdlCatalog): ReleaseMatchCandidate {
    return {
      provider: "ndl-jpro",
      label: line.title,
      description: lineDescription(line),
      sourceUrl: line.records.find((record) => record.sourceUrl)?.sourceUrl ?? "",
      binding: lineBinding(line, catalog),
    };
  }

  private candidatesFromEvaluations(evaluations: readonly NovelCatalogEvaluation[]): ReleaseMatchCandidate[] {
    const byKey = new Map<string, ReleaseMatchCandidate>();
    for (const evaluation of evaluations) {
      for (const line of evaluation.lines.filter((candidate) => candidate.medium !== "comic")) {
        const candidate = this.novelCandidate(line, evaluation.catalog);
        const binding = candidate.binding;
        const key = [binding.provider, binding.title, binding.creator, binding.imprint]
          .map((value) => normalizeTrackingText(value ?? ""))
          .join("\u0000");
        const existing = byKey.get(key);
        if (!existing || (candidate.binding.catalog === "jpro-book" && existing.binding.catalog !== "jpro-book")) {
          byKey.set(key, candidate);
        }
      }
    }
    return [...byKey.values()];
  }

  private async discoverNovel(item: MediaItem): Promise<{
    binding: ReleaseTrackingBinding | null;
    records: NdlPublicationRecord[];
    status: "ambiguous" | "unmatched" | "unconfigured" | "source_regressed";
    message: string;
  }> {
    const evaluations: NovelCatalogEvaluation[] = [];
    const recordsByCatalog = new Map<NdlCatalog, NdlPublicationRecord[]>();
    for (const title of discoveryTitles(item)) {
      for (const catalog of NDL_CATALOGS) {
        const records = await this.ndl.searchCatalog(catalog, title);
        recordsByCatalog.set(catalog, [...(recordsByCatalog.get(catalog) ?? []), ...records]);
        const aggregate = recordsByCatalog.get(catalog) ?? [];
        const evaluation = this.evaluateNovelCatalog(item, catalog, aggregate, [title]);
        evaluations.push(evaluation);
        if (evaluation.safeLine && evaluation.latest && !providerBehindReadingProgress(item, evaluation.latest.volume)) {
          this.matchCache.delete(item.filePath);
          return {
            binding: lineBinding(evaluation.safeLine, catalog),
            records: aggregate,
            status: "unconfigured",
            message: "",
          };
        }
      }

      const titleEvaluations = evaluations.filter((evaluation) =>
        evaluation.lines.some((line) => normalizeTrackingText(line.title) === normalizeTrackingText(title)));
      if (titleEvaluations.some((evaluation) => evaluation.lines.length > 0)) break;
    }

    const candidates = this.candidatesFromEvaluations(evaluations);
    this.matchCache.set(item.filePath, { candidates, recordsByCatalog });
    if (candidates.length === 1) {
      const only = candidates[0];
      const catalog = only.binding.catalog;
      const records = catalog ? recordsByCatalog.get(catalog) ?? [] : [];
      const latest = selectLatestPublishedRecord(records, only.binding, new Date());
      if (latest && !providerBehindReadingProgress(item, latest.volume)) {
        return { binding: only.binding, records, status: "unconfigured", message: "" };
      }
    }
    if (candidates.length > 0) {
      const anyLatestBelowProgress = candidates.some((candidate) => {
        const catalog = candidate.binding.catalog;
        if (!catalog) return false;
        const latest = selectLatestPublishedRecord(recordsByCatalog.get(catalog) ?? [], candidate.binding, new Date());
        return latest ? providerBehindReadingProgress(item, latest.volume) : false;
      });
      if (candidates.length === 1 && anyLatestBelowProgress) {
        return {
          binding: null,
          records: [],
          status: "source_regressed",
          message: "The only NDL/JPRO publication line found is below the recorded reading progress; it was not trusted automatically.",
        };
      }
      return {
        binding: null,
        records: [],
        status: "ambiguous",
        message: "Multiple plausible NDL/JPRO publication lines remain after title, author, and imprint checks.",
      };
    }
    return { binding: null, records: [], status: "unmatched", message: "No safe NDL/JPRO publication line was found." };
  }

  private preparedAttention(
    item: MediaItem,
    provider: "mangadex" | "ndl-jpro" | "",
    status: Exclude<ReleaseTrackingStatus, "verified" | "disabled">,
    message: string,
    binding?: ReleaseTrackingBinding,
    notes: string[] = [],
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
        notes,
      },
      persist: async () => {
        await this.state.writeAttention(item.filePath, item.mediaType, status, message, binding);
      },
    };
  }

  private async prepareManga(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    if (binding?.provider !== "mangadex" || !binding.sourceId) {
      const discovered = await this.discoverMangaBinding(item);
      if (!discovered.binding) return this.preparedAttention(item, "mangadex", discovered.status, discovered.message);
      binding = discovered.binding;
    }
    if (binding.provider !== "mangadex" || !binding.sourceId) throw new Error("MangaDex binding is incomplete.");
    const latest = await this.mangaDex.latestChapter(binding.sourceId);
    if (!latest) {
      return this.preparedAttention(item, "mangadex", "unmatched", "MangaDex returned no numeric chapter that can be safely tracked.", binding);
    }
    if (providerBehindReadingProgress(item, latest)) {
      return this.preparedAttention(
        item, "mangadex", "source_regressed",
        `MangaDex returned Ch.${latest}, below the recorded reading progress Ch.${item.progress}; no latest value was changed.`, binding,
      );
    }
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest, "", "mangadex")) {
      return this.preparedAttention(
        item, "mangadex", "source_regressed",
        `MangaDex returned ${latest}, older than the stored ${current.latest}; the stored value was preserved.`, binding,
      );
    }
    const changed = Boolean(current.latest) && compareChapterLabels(latest, current.latest) > 0;
    const initialized = !current.latest;
    const sourceUrl = `https://mangadex.org/title/${encodeURIComponent(binding.sourceId)}`;
    return {
      result: {
        item,
        kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
        before: current.latest,
        after: latest,
        provider: "mangadex",
        status: "verified",
        message: "",
        sourceUrl,
        notes: [],
      },
      persist: async () => {
        await this.state.writeVerified(item.filePath, item.mediaType, binding, latest, "", sourceUrl);
      },
    };
  }

  private cachedNovelRecords(item: MediaItem, binding: ReleaseTrackingBinding): NdlPublicationRecord[] | null {
    const cached = this.matchCache.get(item.filePath);
    if (!cached || Array.isArray(cached) || !binding.catalog) return null;
    return cached.recordsByCatalog.get(binding.catalog) ?? null;
  }

  private async validateNovelBinding(
    item: MediaItem,
    binding: ReleaseTrackingBinding,
    cachedRecords: NdlPublicationRecord[] | null | undefined,
    previousLatest: string,
    previousDate: string,
  ): Promise<{ binding: ReleaseTrackingBinding; records: NdlPublicationRecord[]; latest: NdlPublicationRecord } | null> {
    if (binding.provider !== "ndl-jpro" || !binding.title) return null;
    for (const catalog of catalogOrder(binding.catalog)) {
      let records: NdlPublicationRecord[];
      try {
        records = catalog === binding.catalog && cachedRecords
          ? cachedRecords
          : await this.ndl.searchCatalog(catalog, binding.title);
      } catch {
        continue;
      }
      const candidateBinding: ReleaseTrackingBinding = { ...binding, catalog };
      const latest = selectLatestPublishedRecord(records, candidateBinding, new Date());
      if (!latest || providerBehindReadingProgress(item, latest.volume)) continue;
      if (providerResultRegressed(previousLatest, previousDate, latest.volume, latest.publishedAt, "ndl-jpro")) continue;
      return { binding: candidateBinding, records, latest };
    }
    return null;
  }

  private async prepareNovel(item: MediaItem, suppliedBinding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    const current = this.state.read(item.filePath, item.mediaType);
    let binding = suppliedBinding ?? current.binding;
    let discoveryRecords: NdlPublicationRecord[] | null = null;
    if (binding?.provider !== "ndl-jpro" || !binding.title) {
      const discovered = await this.discoverNovel(item);
      if (!discovered.binding) return this.preparedAttention(item, "ndl-jpro", discovered.status, discovered.message);
      binding = discovered.binding;
      discoveryRecords = discovered.records;
    }
    if (binding.provider !== "ndl-jpro" || !binding.title) throw new Error("NDL/JPRO binding is incomplete.");

    const validated = await this.validateNovelBinding(
      item,
      binding,
      discoveryRecords ?? this.cachedNovelRecords(item, binding),
      current.latest,
      current.latestReleaseDate,
    );
    if (!validated) {
      const status = current.latest ? "source_regressed" : "unmatched";
      const message = current.latest
        ? `NDL/JPRO could not verify a main-line release at least as reliable as the stored ${current.latest}; the stored value was preserved.`
        : "NDL/JPRO returned no published main-line volume that can be safely verified for the selected source.";
      return this.preparedAttention(item, "ndl-jpro", status, message, binding);
    }
    binding = validated.binding;
    const latest = validated.latest;
    const notes = sidePublicationsAfter(validated.records, binding, latest, new Date()).map(sidePublicationLabel);
    if (providerResultRegressed(current.latest, current.latestReleaseDate, latest.volume, latest.publishedAt, "ndl-jpro")) {
      return this.preparedAttention(
        item,
        "ndl-jpro",
        "source_regressed",
        `NDL/JPRO returned an older publication than the stored ${current.latest}; the stored value was preserved.`,
        binding,
        notes,
      );
    }
    const initialized = !current.latest;
    const changed = Boolean(current.latest) && current.latest !== latest.volume;
    return {
      result: {
        item,
        kind: initialized ? "initialized" : changed ? "updated" : "unchanged",
        before: current.latest,
        after: latest.volume,
        provider: "ndl-jpro",
        status: "verified",
        message: "",
        sourceUrl: latest.sourceUrl,
        notes,
      },
      persist: async () => {
        await this.state.writeVerified(item.filePath, item.mediaType, binding, latest.volume, latest.publishedAt, latest.sourceUrl);
        this.matchCache.delete(item.filePath);
      },
    };
  }

  private async prepareItem(item: MediaItem, binding?: ReleaseTrackingBinding): Promise<PreparedReleaseRefresh> {
    if (item.mediaType === "anime") {
      return {
        result: { item, kind: "skipped", before: "", after: "", provider: "", status: "unconfigured", message: "", sourceUrl: "", notes: [] },
        persist: async () => {},
      };
    }
    const current = this.state.read(item.filePath, item.mediaType);
    if (!binding && current.status === "disabled") {
      return {
        result: { item, kind: "skipped", before: current.latest, after: current.latest, provider: "", status: "disabled", message: "", sourceUrl: this.state.sourceUrl(item.filePath), notes: [] },
        persist: async () => {},
      };
    }
    try {
      return item.mediaType === "manga" ? await this.prepareManga(item, binding) : await this.prepareNovel(item, binding);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.preparedAttention(item, item.mediaType === "manga" ? "mangadex" : "ndl-jpro", "provider_error", message, binding);
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
    const trackable = items.filter((item) => {
      if (item.mediaType !== "manga" && item.mediaType !== "novel") return false;
      return this.state.read(item.filePath, item.mediaType).status !== "disabled";
    });
    const prepared: PreparedReleaseRefresh[] = [];
    for (let index = 0; index < trackable.length; index += 1) {
      const item = trackable[index];
      const provider = providerNameForItem(item);
      onProgress?.({ completed: index, total: trackable.length, item, provider, stage: "checking" });
      prepared.push(await this.prepareItem(item));
      onProgress?.({ completed: index + 1, total: trackable.length, item, provider, stage: "completed" });
    }
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
    const cached = this.matchCache.get(item.filePath);
    if (cached) return Array.isArray(cached) ? cached : cached.candidates;
    if (item.mediaType === "manga") {
      const candidates = (await this.mangaSearchCandidates(item)).map((candidate) => ({
        provider: "mangadex" as const,
        label: candidate.title,
        description: candidate.altTitles.slice(0, 3).join(" · "),
        sourceUrl: candidate.sourceUrl,
        binding: { provider: "mangadex" as const, sourceId: candidate.id, title: candidate.title },
      }));
      this.matchCache.set(item.filePath, candidates);
      return candidates;
    }
    if (item.mediaType === "novel") {
      await this.discoverNovel(item);
      const next = this.matchCache.get(item.filePath);
      return next && !Array.isArray(next) ? next.candidates : [];
    }
    return [];
  }
}

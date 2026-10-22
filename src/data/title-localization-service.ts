import { TFile, type App } from "obsidian";
import type { ExternalMediaResult, MediaType, WikidataTitleEvidence } from "../domain/media-types";
import { WikidataTitleService } from "./wikidata-title-service";
import { chineseScriptCandidate, mergeOfficialTitles, verifiedMediaTitle } from "../domain/media-title-localization";
import type { SupportedLocale } from "../i18n/locale";
import { getScopedMarkdownFiles } from "./vault-scope";
import { BangumiClient } from "./providers/bangumi-client";
import { AniListClient } from "./providers/anilist-client";

type Provider = "bangumi" | "anilist";
export type TitleSource = Readonly<{ provider: Provider; id: string }>;
export type TitleScanStatus = "ready" | "review" | "unchanged" | "no-source" |
  "no-translation" | "custom-title" | "ambiguous" | "lookup-failed";

/** Only a resolved no-op can be checkpointed before user confirmation. */
export function completedTitleScan(status: TitleScanStatus): boolean {
  return status === "unchanged" || status === "custom-title";
}
export interface TitleUpdateItem {
  readonly path: string;
  readonly oldTitle: string;
  readonly newTitle: string;
  readonly source: TitleSource | null;
  readonly requiresReview: boolean;
  readonly expectedProvider: string;
  readonly expectedSourceId: string;
  readonly expectedAniListId: string;
  readonly expectedMtime: number;
  readonly originalTitle: string;
  readonly aliases: readonly string[];
  readonly localized: Partial<Record<SupportedLocale, string>>;
  /** Accepted script conversions are distinct from verified provider titles. */
  readonly scriptConversions: Partial<Record<SupportedLocale, string>>;
  readonly wikidataEvidence?: WikidataTitleEvidence;
}
export interface TitleScanRow {
  readonly path: string;
  readonly title: string;
  readonly status: TitleScanStatus;
  readonly reason: string;
  readonly proposal?: TitleUpdateItem;
}
export interface TitleUpdatePlan {
  readonly locale: SupportedLocale;
  readonly scanned: number;
  readonly skipped: number;
  readonly rows: readonly TitleScanRow[];
  readonly failures: ReadonlyArray<{ path: string; message: string }>;
  readonly items: readonly TitleUpdateItem[];
}
export interface TitleUpdateResult {
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ path: string; message: string }>;
  updatedPaths: string[];
}
export interface TitleUpdateOptions {
  fetch?: (mediaType: MediaType, source: TitleSource) => Promise<ExternalMediaResult | null>;
  lookup?: (mediaType: MediaType, title: string) => Promise<ExternalMediaResult[]>;
  lookupWikidata?: (type: MediaType, source: TitleSource, locale: SupportedLocale) => Promise<WikidataTitleEvidence | null>;
  intervalMs?: number;
  concurrency?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, row: TitleScanRow) => void;
  onStart?: (completed: number, total: number, title: string, path: string) => void;
  shouldScan?: (file: TFile) => boolean;
}
function field(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function values(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean) : [];
}
function mediaTypeOf(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}
function knownTitles(value: unknown): Partial<Record<SupportedLocale, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return mergeOfficialTitles(undefined, {
    "zh-TW": field(raw["zh-TW"]), "zh-CN": field(raw["zh-CN"]),
    en: field(raw.en), ja: field(raw.ja), ko: field(raw.ko),
  });
}
function normalizeTitle(value: string): string {
  return value.normalize("NFKC").replace(/[\p{P}\p{S}\s]+/gu, "").toLocaleLowerCase();
}
function bangumiId(url: string): string {
  return /https?:\/\/(?:bgm\.tv|bangumi\.tv)\/subject\/(\d+)(?:[/?#]|$)/i.exec(url)?.[1] ?? "";
}
function anilistId(url: string): string {
  return /https?:\/\/(?:www\.)?anilist\.co\/(?:anime|manga)\/(\d+)(?:[/?#]|$)/i.exec(url)?.[1] ?? "";
}
function ids(fm: Record<string, unknown>): { bangumi: string; anilist: string } {
  const provider = field(fm.source_provider);
  const sourceId = field(fm.source_id);
  const links = values(fm.source_urls);
  return {
    bangumi: (provider === "bangumi" && /^\d+$/.test(sourceId) ? sourceId : "")
      || links.map(bangumiId).find(Boolean) || "",
    anilist: field(fm.anilist_id) || (provider === "anilist" && /^\d+$/.test(sourceId) ? sourceId : "")
      || links.map(anilistId).find(Boolean) || "",
  };
}
function preferredSource(fm: Record<string, unknown>): TitleSource | null {
  const all = ids(fm);
  const primary = field(fm.source_provider);
  if (primary === "bangumi" && /^\d+$/.test(all.bangumi)) return { provider: "bangumi", id: all.bangumi };
  if (primary === "anilist" && /^\d+$/.test(all.anilist)) return { provider: "anilist", id: all.anilist };
  if (/^\d+$/.test(all.bangumi)) return { provider: "bangumi", id: all.bangumi };
  if (/^\d+$/.test(all.anilist)) return { provider: "anilist", id: all.anilist };
  return null;
}
function identity(fm: Record<string, unknown>): readonly [string, string, string] {
  return [field(fm.source_provider), field(fm.source_id), field(fm.anilist_id)];
}
function matchesSource(fm: Record<string, unknown>, item: TitleUpdateItem): boolean {
  const [provider, id, ani] = identity(fm);
  return provider === item.expectedProvider && id === item.expectedSourceId && ani === item.expectedAniListId;
}
function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Title update preview was cancelled.");
}
function row(path: string, title: string, status: TitleScanStatus, reason: string, proposal?: TitleUpdateItem): TitleScanRow {
  return { path, title, status, reason, ...(proposal ? { proposal } : {}) };
}
function providerTitles(candidate: ExternalMediaResult): string[] {
  return [candidate.title, candidate.originalTitle, candidate.romajiTitle,
    ...(candidate.searchTitles ?? []), ...Object.values(candidate.titleVariants?.localized ?? {})]
    .map(v => v?.trim() ?? "").filter(Boolean);
}
function crossProviderCandidates(matches: readonly ExternalMediaResult[], fm: Record<string, unknown>): ExternalMediaResult[] {
  const names = [field(fm.title_original), field(fm.title_romaji), field(fm.title), ...values(fm.title_aliases)]
    .map(normalizeTitle).filter(Boolean);
  const year = Number(fm.year);
  return matches.filter(candidate => {
    if (candidate.provider !== "bangumi" || !/^\d+$/.test(candidate.sourceId)) return false;
    if (!providerTitles(candidate).some(name => names.includes(normalizeTitle(name)))) return false;
    const otherYear = Number(candidate.year);
    return !(Number.isFinite(year) && year > 0 && Number.isFinite(otherYear) && otherYear > 0 && year !== otherYear);
  });
}

export async function planStoredTitleUpdates(
  app: App, roots: string[], locale: SupportedLocale, options: TitleUpdateOptions = {},
): Promise<TitleUpdatePlan> {
  const bangumi = new BangumiClient();
  const anilist = new AniListClient();
  const wikidata = new WikidataTitleService();
  const lookupWikidata = options.lookupWikidata ?? ((type: MediaType, source: TitleSource, lang: SupportedLocale) =>
    wikidata.lookup({ provider: source.provider, sourceId: source.id, mediaType: type }, lang));
  const fetch = options.fetch ?? (async (mediaType: MediaType, source: TitleSource) =>
    source.provider === "bangumi"
      ? bangumi.fetchTitleById(mediaType, source.id)
      : anilist.fetchMediaById(mediaType, source.id));
  const lookup = options.lookup ?? (async (mediaType: MediaType, title: string) =>
    (await bangumi.searchPage(mediaType, title, 1)).results);
  const sleep = options.sleep ?? (async (ms: number) =>
    new Promise<void>(resolve => window.setTimeout(resolve, ms)));
  const intervalMs = Math.max(0, options.intervalMs ?? 350);
  const concurrency = Math.min(4, Math.max(1, Math.floor(options.concurrency ?? 3)));
  let nextRequest = 0;
  async function apiCall<T>(task: () => Promise<T>): Promise<T> {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + intervalMs;
    if (start > Date.now()) await sleep(start - Date.now());
    assertNotAborted(options.signal);
    const result = await task();
    assertNotAborted(options.signal);
    return result;
  }
  const metadataCache = new Map<string, Promise<ExternalMediaResult | null>>();
  function fetchCached(type: MediaType, source: TitleSource): Promise<ExternalMediaResult | null> {
    const key = type + ":" + source.provider + ":" + source.id;
    let pending = metadataCache.get(key);
    if (pending === undefined) {
      pending = apiCall(() => fetch(type, source));
      metadataCache.set(key, pending);
    }
    return pending;
  }
  const files = getScopedMarkdownFiles(app, roots).filter(f =>
    mediaTypeOf(app.metadataCache.getFileCache(f)?.frontmatter?.media_type) !== null
      && (options.shouldScan?.(f) ?? true));
  const rows: TitleScanRow[] = [];
  let next = 0;
  let completed = 0;
  async function evaluate(file: TFile): Promise<TitleScanRow> {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    const type = mediaTypeOf(fm?.media_type);
    const old = field(fm?.title);
    if (!fm || !type || !old) return row(file.path, old || file.basename, "no-source", "Media title or type is missing.");
    const stored = knownTitles(fm.title_localizations);
    const approvedConversions = knownTitles(fm.title_script_conversions);
    const source = preferredSource(fm);
    let candidate: ExternalMediaResult | null = null;
    let target = stored[locale] ?? "";
    let requiresReview = false;
    let scriptConverted = false;
    let reusedConversion = false;
    let selectedSource: TitleSource | null = source;
    let crossProvider = false;
    let wikidataEvidence: WikidataTitleEvidence | undefined;
    let directFetchError = "";
    const trustedNames: string[] = [];
    if (!target && source) {
      try {
        candidate = await fetchCached(type, source);
        if (candidate) {
          if (candidate.sourceId !== source.id || candidate.provider !== source.provider || candidate.mediaType !== type) {
            throw new Error("Provider returned unexpected media identity (work ID or type).");
          }
          trustedNames.push(...providerTitles(candidate));
          target = verifiedMediaTitle(candidate.titleVariants, locale) ?? "";
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (reason.includes("unexpected media identity")) throw error;
        directFetchError = reason;
      }
    }
    // A known exact ID is preferred independently of locale. Look up a second
    // verified ID only if the primary provider has no localized title.
    const known = ids(fm);
    if (!target && source?.provider === "anilist" && /^\d+$/.test(known.bangumi)) {
      const secondary = { provider: "bangumi" as const, id: known.bangumi };
      const secondaryCandidate = await fetchCached(type, secondary);
      if (secondaryCandidate?.provider === "bangumi" && secondaryCandidate.sourceId === secondary.id
        && secondaryCandidate.mediaType === type) {
        candidate = secondaryCandidate;
        selectedSource = secondary;
        trustedNames.push(...providerTitles(candidate));
        target = verifiedMediaTitle(candidate.titleVariants, locale) ?? "";
      }
    }
    if (!target && source?.provider === "bangumi" && /^\d+$/.test(known.anilist)) {
      const secondary = { provider: "anilist" as const, id: known.anilist };
      const secondaryCandidate = await fetchCached(type, secondary);
      if (secondaryCandidate?.provider === "anilist" && secondaryCandidate.sourceId === secondary.id
        && secondaryCandidate.mediaType === type) {
        candidate = secondaryCandidate;
        selectedSource = secondary;
        trustedNames.push(...providerTitles(candidate));
        target = verifiedMediaTitle(candidate.titleVariants, locale) ?? "";
      }
    }
    if (!target && source) {
      try {
        const evidence = await apiCall(() => lookupWikidata(type, source, locale));
        if (evidence?.title) {
          wikidataEvidence = evidence;
          target = evidence.title;
          requiresReview = true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        directFetchError = directFetchError ? directFetchError + "; Wikidata: " + message : "Wikidata: " + message;
      }
    }
    if (!target && (locale === "zh-TW" || locale === "zh-CN") && known.anilist && !known.bangumi) {
      const query = field(fm.title_original) || field(fm.title_romaji) || old;
      const results = crossProviderCandidates(await apiCall(() => lookup(type, query)), fm);
      if (results.length > 1) return row(file.path, old, "ambiguous", "Several Bangumi works match; no automatic selection.");
      if (results.length === 1) {
        selectedSource = { provider: "bangumi", id: results[0].sourceId };
        candidate = await fetchCached(type, selectedSource);
        if (!candidate || candidate.sourceId !== selectedSource.id || candidate.provider !== "bangumi" || candidate.mediaType !== type) {
          throw new Error("Cross-provider match could not be verified by Bangumi ID.");
        }
        requiresReview = true;
        crossProvider = true;
        target = verifiedMediaTitle(candidate.titleVariants, locale) ?? "";
      }
      if (!results.length && !candidate && !directFetchError) {
        return row(file.path, old, "no-source", "No matching language variant in known providers.");
      }
    }
    if (!target && approvedConversions[locale]) {
      target = approvedConversions[locale];
      reusedConversion = true;
      requiresReview = true;
    }
    if (!target && (locale === "zh-TW" || locale === "zh-CN")) {
      const alternatives = mergeOfficialTitles(stored, candidate?.titleVariants?.localized);
      target = chineseScriptCandidate({ fallback: "", localized: alternatives }, locale) ?? "";
      if (target) {
        scriptConverted = true;
        requiresReview = true;
      }
    }
    if (!target && directFetchError) {
      return row(file.path, old, "lookup-failed", directFetchError);
    }
    if (!target && !source && !candidate) return row(file.path, old, "no-source", "No trusted source ID or stored title for this language.");
    if (!target) {
      const onlySimplified = locale === "zh-TW" && candidate?.titleVariants?.localized?.["zh-CN"];
      return row(file.path, old, "no-translation", onlySimplified
        ? "Bangumi supplies Simplified Chinese only; no verified Traditional Chinese title."
        : "The provider has no verified title in the chosen language.");
    }
    if (normalizeTitle(target) === normalizeTitle(old)) return row(file.path, old, "unchanged", "Already matches the requested title.");
    const owned = [...trustedNames, ...Object.values(stored), ...Object.values(approvedConversions),
      field(fm.title_original), ...values(fm.title_aliases)]
      .some(name => normalizeTitle(name) === normalizeTitle(old));
    if (!owned) return row(file.path, old, "custom-title", "Current title is not recognized as a source title; preserving customization.");
    const merged = crossProvider ? stored : mergeOfficialTitles(stored, candidate?.titleVariants?.localized);
    const scriptConversions = scriptConverted
      ? { ...approvedConversions, [locale]: target }
      : approvedConversions;
    const aliases = [...new Set([...values(fm.title_aliases), old, field(fm.title_original),
      field(fm.title_romaji), ...(candidate ? providerTitles(candidate) : []), target]
      .map(name => name.trim()).filter(Boolean))];
    const proposal: TitleUpdateItem = {
      path: file.path, oldTitle: old, newTitle: target, source: selectedSource, requiresReview,
      expectedProvider: field(fm.source_provider), expectedSourceId: field(fm.source_id),
      expectedAniListId: field(fm.anilist_id), expectedMtime: file.stat.mtime,
      originalTitle: field(fm.title_original) || candidate?.originalTitle || "",
      aliases, localized: merged, scriptConversions,
      ...(wikidataEvidence ? { wikidataEvidence } : {}),
    };
    return row(file.path, old, requiresReview ? "review" : "ready",
      wikidataEvidence ? "Wikidata/Wikipedia language title (not an official licensed translation); review before applying."
        : scriptConverted ? "OpenCC script conversion only (NOT an official localized release title); verify before applying."
        : reusedConversion ? "Previously approved OpenCC conversion (NOT an official translated title); review before applying."
        : requiresReview ? "Cross-provider title match: manually verify this identity." : "Verified provider ID and title.",
      proposal);
  }
  async function worker(): Promise<void> {
    while (next < files.length) {
      assertNotAborted(options.signal);
      const idx = next++;
      const file = files[idx];
      const title = field(app.metadataCache.getFileCache(file)?.frontmatter?.title) || file.basename;
      options.onStart?.(completed, files.length, title, file.path);
      try {
        rows[idx] = await evaluate(file);
      } catch (error) {
        assertNotAborted(options.signal);
        rows[idx] = row(file.path,
          field(app.metadataCache.getFileCache(file)?.frontmatter?.title) || file.basename,
          "lookup-failed", error instanceof Error ? error.message : String(error));
      }
      completed++;
      options.onProgress?.(completed, files.length, rows[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  const items = rows.flatMap(r => r.proposal ? [r.proposal] : []);
  const failures = rows.filter(r => r.status === "lookup-failed").map(r => ({ path: r.path, message: r.reason }));
  return { locale, scanned: files.length, skipped: rows.length - items.length - failures.length, rows, failures, items };
}

/** Confirmed, narrow frontmatter writes; no renamed paths, note body or asset writes. */
export async function applyStoredTitleUpdates(
  app: App, plan: TitleUpdatePlan, selectedPaths: ReadonlySet<string>,
): Promise<TitleUpdateResult> {
  const result: TitleUpdateResult = { updated: 0, skipped: 0, failed: 0, errors: [], updatedPaths: [] };
  for (const item of plan.items) {
    if (!selectedPaths.has(item.path)) continue;
    const file = app.vault.getAbstractFileByPath(item.path);
    if (!(file instanceof TFile) || file.stat.mtime !== item.expectedMtime) {
      result.skipped++;
      continue;
    }
    let changed = false;
    try {
      await app.fileManager.processFrontMatter(file, fm => {
        if (field(fm.title) !== item.oldTitle || !matchesSource(fm, item)) return;
        fm.title = item.newTitle;
        if (!field(fm.title_original) && item.originalTitle) fm.title_original = item.originalTitle;
        fm.title_aliases = [...new Set([...values(fm.title_aliases), ...item.aliases])];
        if (Object.keys(item.localized).length) {
          fm.title_localizations = {
            ...((fm.title_localizations && typeof fm.title_localizations === "object" && !Array.isArray(fm.title_localizations))
              ? fm.title_localizations as Record<string, unknown> : {}),
            ...item.localized,
          };
        }
        if (item.wikidataEvidence?.title === item.newTitle) {
          fm.title_external_evidence = {
            locale: item.wikidataEvidence.locale,
            title: item.wikidataEvidence.title,
            source: item.wikidataEvidence.kind,
            wikidata_id: item.wikidataEvidence.itemId,
            identity_property: item.wikidataEvidence.identityProperty,
          };
        }
        if (Object.keys(item.scriptConversions).length) {
          fm.title_script_conversions = {
            ...((fm.title_script_conversions && typeof fm.title_script_conversions === "object" && !Array.isArray(fm.title_script_conversions))
              ? fm.title_script_conversions as Record<string, unknown> : {}),
            ...item.scriptConversions,
          };
        }
        changed = true;
      });
      if (changed) {
        result.updated++;
        result.updatedPaths.push(file.path);
      } else result.skipped++;
    } catch (error) {
      result.failed++;
      result.errors.push({ path: item.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

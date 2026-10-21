import { TFile, type App } from "obsidian";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { mergeOfficialTitles, verifiedMediaTitle } from "../domain/media-title-localization";
import type { SupportedLocale } from "../i18n/locale";
import { getScopedMarkdownFiles } from "./vault-scope";
import { BangumiClient } from "./providers/bangumi-client";
import { AniListClient } from "./providers/anilist-client";

type Provider = "bangumi" | "anilist";
export type TitleSource = Readonly<{ provider: Provider; id: string }>;

export interface TitleUpdateItem {
  readonly path: string;
  readonly oldTitle: string;
  readonly newTitle: string;
  readonly source: TitleSource;
  readonly expectedProvider: string;
  readonly expectedSourceId: string;
  readonly expectedAniListId: string;
  readonly expectedMtime: number;
  readonly originalTitle: string;
  readonly aliases: readonly string[];
  readonly localized: Partial<Record<SupportedLocale, string>>;
}

export interface TitleUpdatePlan {
  readonly locale: SupportedLocale;
  readonly scanned: number;
  readonly skipped: number;
  readonly failures: ReadonlyArray<{ path: string; message: string }>;
  readonly items: readonly TitleUpdateItem[];
}

export interface TitleUpdateResult {
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ path: string; message: string }>;
}

export interface TitleUpdateOptions {
  fetch?: (mediaType: MediaType, source: TitleSource) => Promise<ExternalMediaResult | null>;
  intervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, title: string) => void;
}

function field(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function values(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) : [];
}
function mediaTypeOf(value: unknown): MediaType | null {
  return value === "anime" || value === "manga" || value === "novel" ? value : null;
}
function knownTitles(value: unknown): Partial<Record<SupportedLocale, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return mergeOfficialTitles(undefined, {
    "zh-TW": field(raw["zh-TW"]),
    "zh-CN": field(raw["zh-CN"]),
    en: field(raw.en),
    ja: field(raw.ja),
    ko: field(raw.ko),
  });
}
function sourceFor(frontmatter: Record<string, unknown>, locale: SupportedLocale): TitleSource | null {
  const provider = field(frontmatter.source_provider);
  const sourceId = field(frontmatter.source_id);
  const anilistId = field(frontmatter.anilist_id);
  if (locale === "zh-TW" || locale === "zh-CN") {
    return provider === "bangumi" && /^\d+$/.test(sourceId) ? { provider: "bangumi", id: sourceId } : null;
  }
  const id = anilistId || (provider === "anilist" ? sourceId : "");
  if (/^\d+$/.test(id)) return { provider: "anilist", id };
  return provider === "bangumi" && /^\d+$/.test(sourceId) ? { provider: "bangumi", id: sourceId } : null;
}
function identity(frontmatter: Record<string, unknown>): readonly [string, string, string] {
  return [field(frontmatter.source_provider), field(frontmatter.source_id), field(frontmatter.anilist_id)];
}
function matchesSource(frontmatter: Record<string, unknown>, item: TitleUpdateItem): boolean {
  const [provider, id, ani] = identity(frontmatter);
  return provider === item.expectedProvider && id === item.expectedSourceId && ani === item.expectedAniListId;
}
function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Title update preview was cancelled.");
}
function candidateTitle(result: ExternalMediaResult | null, locale: SupportedLocale): string | null {
  return verifiedMediaTitle(result?.titleVariants, locale);
}
function normalizeTitle(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

/** Preview-only read operations. Never use fuzzy title matching to establish identity. */
export async function planStoredTitleUpdates(
  app: App,
  roots: string[],
  locale: SupportedLocale,
  options: TitleUpdateOptions = {},
): Promise<TitleUpdatePlan> {
  const bangumi = new BangumiClient();
  const anilist = new AniListClient();
  const fetch = options.fetch ?? (async (mediaType: MediaType, source: TitleSource) =>
    source.provider === "bangumi"
      ? bangumi.fetchById(mediaType, source.id)
      : anilist.fetchMediaById(mediaType, source.id));
  const sleep = options.sleep ?? (async (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)));
  const intervalMs = Math.max(0, options.intervalMs ?? 1_200);
  const files = getScopedMarkdownFiles(app, roots);
  const items: TitleUpdateItem[] = [];
  const failures: Array<{ path: string; message: string }> = [];
  let skipped = 0;
  let lastFetch = 0;
  for (const [index, file] of files.entries()) {
    assertNotAborted(options.signal);
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    const mediaType = mediaTypeOf(fm?.media_type);
    const oldTitle = field(fm?.title);
    if (!fm || !mediaType || !oldTitle) {
      skipped += 1;
      options.onProgress?.(index + 1, files.length, oldTitle || file.basename);
      continue;
    }
    const source = sourceFor(fm, locale);
    if (!source) {
      skipped += 1;
      options.onProgress?.(index + 1, files.length, oldTitle);
      continue;
    }
    const stored = knownTitles(fm.title_localizations);
    let candidate: ExternalMediaResult | null = null;
    let nextTitle = stored[locale] ?? null;
    if (!nextTitle) {
      try {
        const delay = Math.max(0, intervalMs - (Date.now() - lastFetch));
        if (lastFetch && delay) await sleep(delay);
        assertNotAborted(options.signal);
        lastFetch = Date.now();
        candidate = await fetch(mediaType, source);
        assertNotAborted(options.signal);
        if (candidate && (candidate.provider !== source.provider || candidate.sourceId !== source.id || candidate.mediaType !== mediaType)) {
          throw new Error("Provider returned an unexpected media identity.");
        }
        nextTitle = candidateTitle(candidate, locale);
      } catch (error) {
        assertNotAborted(options.signal);
        failures.push({ path: file.path, message: error instanceof Error ? error.message : String(error) });
        options.onProgress?.(index + 1, files.length, oldTitle);
        continue;
      }
    }
    if (!nextTitle || normalizeTitle(nextTitle) === normalizeTitle(oldTitle)) {
      skipped += 1;
      options.onProgress?.(index + 1, files.length, oldTitle);
      continue;
    }
    const known = mergeOfficialTitles(stored, candidate?.titleVariants?.localized);
    const aliases = [...new Set([oldTitle, field(fm.title_original), field(fm.title_romaji),
      ...values(fm.title_aliases), ...(candidate?.searchTitles ?? []), candidate?.originalTitle ?? "", nextTitle]
      .map((name) => name.trim()).filter(Boolean))];
    // Safeguard against silently overwriting user-authored names.
    const providerNames = candidate
      ? [candidate.title, candidate.originalTitle, candidate.romajiTitle,
        ...(candidate.searchTitles ?? []), ...Object.values(candidate.titleVariants?.localized ?? {})]
      : [];
    const recognized = new Set([...providerNames, ...Object.values(known)].map(normalizeTitle));
    if (candidate && !recognized.has(normalizeTitle(oldTitle))) {
      skipped += 1;
      options.onProgress?.(index + 1, files.length, oldTitle);
      continue;
    }
    if (!candidate && !Object.values(stored).some(v => normalizeTitle(v) === normalizeTitle(oldTitle))
      && !values(fm.title_aliases).some(v => normalizeTitle(v) === normalizeTitle(oldTitle))) {
      skipped += 1;
      options.onProgress?.(index + 1, files.length, oldTitle);
      continue;
    }
    items.push({
      path: file.path, oldTitle, newTitle: nextTitle, source,
      expectedProvider: field(fm.source_provider),
      expectedSourceId: field(fm.source_id),
      expectedAniListId: field(fm.anilist_id),
      expectedMtime: file.stat.mtime,
      originalTitle: field(fm.title_original) || candidate?.originalTitle || "",
      aliases,
      localized: known,
    });
    options.onProgress?.(index + 1, files.length, oldTitle);
  }
  return { locale, scanned: files.length, skipped, failures, items };
}

/** Apply only confirmed rows, rechecking title, identity and modification time. */
export async function applyStoredTitleUpdates(
  app: App,
  plan: TitleUpdatePlan,
  selectedPaths: ReadonlySet<string>,
): Promise<TitleUpdateResult> {
  const result: TitleUpdateResult = { updated: 0, skipped: 0, failed: 0, errors: [] };
  for (const item of plan.items) {
    if (!selectedPaths.has(item.path)) continue;
    const file = app.vault.getAbstractFileByPath(item.path);
    if (!(file instanceof TFile) || file.stat.mtime !== item.expectedMtime) {
      result.skipped += 1;
      continue;
    }
    let changed = false;
    try {
      await app.fileManager.processFrontMatter(file, (fm) => {
        if (field(fm.title) !== item.oldTitle || !matchesSource(fm, item)) return;
        changed = true;
        fm.title = item.newTitle;
        if (!field(fm.title_original) && item.originalTitle) fm.title_original = item.originalTitle;
        fm.title_aliases = [...new Set([...values(fm.title_aliases), ...item.aliases])];
        fm.title_localizations = { ...((fm.title_localizations && typeof fm.title_localizations === "object" && !Array.isArray(fm.title_localizations)) ? fm.title_localizations as Record<string, unknown> : {}), ...item.localized };
      });
      if (changed) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ path: item.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

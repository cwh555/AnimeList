/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- Runtime adapter around the legacy add modal. */
import LegacyAnimeListPlugin, { legacyTest } from "./legacy";
import { findConfidentDuplicate, type StoredMediaIdentity } from "./duplicate-detection";
import {
  DEFAULT_SEARCH_LANGUAGES,
  searchMultilingualProviders,
  type SearchProviderAdapter,
} from "./multilingual-search";
import { searchFeatureText } from "./search-feature-text";
import type { AnimeListSettings, ExternalMediaResult, MediaNoteForm, MediaType } from "./types";
import { mediaProviderLabel } from "./ui-text";
import { getScopedMarkdownFiles } from "./vault-scope";

const PATCH_MARKER = Symbol.for("animelist.search-enhancements.installed");
const INSTANCE_MARKER = Symbol.for("animelist.search-enhancements.instance");
const { dedupeSearchResults } = legacyTest;

interface EnhancementState {
  results: ExternalMediaResult[];
}

interface SearchEnhancedPlugin extends LegacyAnimeListPlugin {
  settings: AnimeListSettings;
  searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }>;
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<unknown>;
  getScanFolders?(): string[];
  [INSTANCE_MARKER]?: EnhancementState;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(stringValue).map((entry) => entry.trim()).filter(Boolean);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function collectStoredMedia(plugin: SearchEnhancedPlugin): StoredMediaIdentity[] {
  const roots = typeof plugin.getScanFolders === "function" ? plugin.getScanFolders() : ["Media"];
  return getScopedMarkdownFiles(plugin.app, roots).flatMap((file) => {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const mediaType = frontmatter?.media_type;
    if (mediaType !== "anime" && mediaType !== "manga" && mediaType !== "novel") return [];
    return [{
      filePath: file.path,
      title: stringValue(frontmatter.title) || file.basename,
      originalTitle: stringValue(frontmatter.title_original),
      romajiTitle: stringValue(frontmatter.title_romaji),
      aliases: stringArray(frontmatter.title_aliases),
      mediaType,
      format: stringValue(frontmatter.format),
      year: typeof frontmatter.year === "number" || typeof frontmatter.year === "string" ? frontmatter.year : "",
      total: numberValue(frontmatter.progress_total),
      provider: stringValue(frontmatter.source_provider),
      sourceId: stringValue(frontmatter.source_id),
      sourceUrls: stringArray(frontmatter.source_urls),
    }];
  });
}

function providersFor(plugin: SearchEnhancedPlugin, mediaType: MediaType): SearchProviderAdapter[] {
  const providers: SearchProviderAdapter[] = [];
  if (plugin.settings.providers.bangumi) {
    providers.push({
      label: "Bangumi",
      search: (query) => plugin.searchBangumi(mediaType, query),
    });
  }
  if (plugin.settings.providers.anilist) {
    providers.push({
      label: "AniList",
      search: (query) => plugin.searchAniList(mediaType, query),
    });
  }
  if (mediaType === "novel" && plugin.settings.providers.openlibrary) {
    providers.push({
      label: "Open Library",
      search: (query) => plugin.searchOpenLibrary(query),
    });
  }
  return providers;
}

function aliasesFor(result: ExternalMediaResult): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of [result.title, result.originalTitle, result.romajiTitle, ...(result.searchTitles ?? [])]) {
    const clean = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function installInstanceEnhancements(plugin: SearchEnhancedPlugin): EnhancementState {
  const installed = plugin[INSTANCE_MARKER];
  if (installed) return installed;
  const state: EnhancementState = { results: [] };
  Object.defineProperty(plugin, INSTANCE_MARKER, { value: state });

  plugin.searchExternal = async (mediaType, query) => {
    const response = await searchMultilingualProviders({
      query,
      providers: providersFor(plugin, mediaType),
      languages: plugin.settings.searchLanguages ?? DEFAULT_SEARCH_LANGUAGES,
      dedupe: (results) => dedupeSearchResults(results) as ExternalMediaResult[],
      maxResults: 24,
    });
    state.results = response.results;
    return { results: response.results, warnings: response.warnings };
  };

  const originalCreateMediaNote = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const file = await originalCreateMediaNote(result, form);
    const aliases = aliasesFor(result);
    if (aliases.length && file && typeof file === "object" && "path" in file) {
      try {
        await plugin.app.fileManager.processFrontMatter(file as never, (frontmatter) => {
          const existing = stringArray(frontmatter.title_aliases);
          frontmatter.title_aliases = [...new Set([...existing, ...aliases])];
        });
      } catch (error) {
        console.warn("AnimeList could not persist title aliases", error);
      }
    }
    return file;
  };
  return state;
}

function selectedResult(modalEl: HTMLElement, state: EnhancementState): ExternalMediaResult | null {
  const preview = modalEl.querySelector(".al-selected-preview");
  const title = preview?.querySelector("h2")?.textContent?.trim() ?? "";
  const provider = preview?.querySelector(".al-kicker")?.textContent?.trim() ?? "";
  if (!title) return null;
  return state.results.find((result) => result.title === title && mediaProviderLabel(result.provider) === provider)
    ?? state.results.find((result) => result.title === title)
    ?? null;
}

function installDuplicateWarning(
  plugin: SearchEnhancedPlugin,
  modalEl: HTMLElement,
  state: EnhancementState,
): void {
  const render = (): void => {
    if (!modalEl.isConnected) {
      observer.disconnect();
      return;
    }
    const form = modalEl.querySelector(".al-media-form");
    const result = selectedResult(modalEl, state);
    const existingWarning = modalEl.querySelector<HTMLElement>(".al-duplicate-warning");
    if (!form || !result) {
      existingWarning?.remove();
      return;
    }
    const duplicate = findConfidentDuplicate(result, collectStoredMedia(plugin));
    if (!duplicate) {
      existingWarning?.remove();
      return;
    }
    const signature = `${result.provider}:${result.sourceId}:${duplicate.filePath}`;
    if (existingWarning?.dataset.duplicateSignature === signature) return;
    existingWarning?.remove();

    const warning = modalEl.ownerDocument.createElement("section");
    warning.className = "al-modal-warning al-duplicate-warning";
    warning.dataset.duplicateSignature = signature;
    const title = modalEl.ownerDocument.createElement("strong");
    title.textContent = searchFeatureText("duplicate.warning.title");
    const description = modalEl.ownerDocument.createElement("p");
    description.textContent = searchFeatureText("duplicate.warning.description", { title: duplicate.title });
    const open = modalEl.ownerDocument.createElement("button");
    open.type = "button";
    open.className = "al-secondary-button";
    open.textContent = searchFeatureText("duplicate.warning.open");
    open.addEventListener("click", () => {
      void plugin.app.workspace.openLinkText(duplicate.filePath, "", false);
    });
    warning.append(title, description, open);
    form.insertAdjacentElement("beforebegin", warning);
  };

  const observer = new MutationObserver(render);
  observer.observe(modalEl, { childList: true, subtree: true });
  render();
}

const prototype = LegacyAnimeListPlugin.prototype as SearchEnhancedPlugin;
if (prototype[PATCH_MARKER] !== true) {
  const originalOpenAddModal = prototype.openAddModal;
  prototype.openAddModal = function openAddModalWithSearchEnhancements(initialType = "anime") {
    const state = installInstanceEnhancements(this);
    originalOpenAddModal.call(this, initialType);
    window.queueMicrotask(() => {
      const modals = [...document.querySelectorAll<HTMLElement>(".animelist-modal")];
      const modalEl = modals.at(-1);
      if (modalEl) installDuplicateWarning(this, modalEl, state);
    });
  };
  Object.defineProperty(prototype, PATCH_MARKER, { value: true });
}

/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- End runtime adapter scope. */

import { Modal, TFile } from "obsidian";
import LegacyAnimeListPlugin from "./legacy";
import { findConfidentDuplicate, type StoredMediaIdentity } from "./duplicate-detection";
import {
  searchMultilingualProviders,
  type SearchProviderAdapter,
} from "./multilingual-search";
import { searchFeatureText } from "./search-feature-text";
import type { AnimeListSettings, ExternalMediaResult, MediaNoteForm, MediaType } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const PATCH_MARKER = Symbol.for("animelist.search-enhancements.modal-details");
const INSTALLED_PLUGINS = new WeakSet<object>();

type SearchEnhancedPlugin = LegacyAnimeListPlugin & {
  settings: AnimeListSettings;
  getScanFolders?(): string[];
};

interface SearchRuntimeMethods {
  searchExternal(mediaType: MediaType, query: string): Promise<{ results: ExternalMediaResult[]; warnings: string[] }>;
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
}

type CreateMediaNoteMethod = (
  this: SearchEnhancedPlugin,
  result: ExternalMediaResult,
  form: MediaNoteForm,
) => Promise<unknown>;

interface LegacyAddMediaModal extends Modal {
  renderDetails: (result: ExternalMediaResult) => Promise<void>;
}

interface AddModalPrototype extends Record<PropertyKey, unknown> {
  openAddModal: (this: SearchEnhancedPlugin, initialType?: MediaType) => void;
}

function runtimeMethods(plugin: SearchEnhancedPlugin): SearchRuntimeMethods {
  return plugin as unknown as SearchRuntimeMethods;
}

function createMediaNoteMethod(plugin: SearchEnhancedPlugin): CreateMediaNoteMethod {
  const method: unknown = Reflect.get(plugin, "createMediaNote");
  if (typeof method !== "function") throw new Error("AnimeList createMediaNote is unavailable.");
  return method as CreateMediaNoteMethod;
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
  const methods = runtimeMethods(plugin);
  if (plugin.settings.providers.bangumi) {
    providers.push({
      label: "Bangumi",
      supportsChineseDiscovery: true,
      search: (query) => methods.searchBangumi(mediaType, query),
    });
  }
  if (plugin.settings.providers.anilist) {
    providers.push({
      label: "AniList",
      search: (query) => methods.searchAniList(mediaType, query),
    });
  }
  if (mediaType === "novel" && plugin.settings.providers.openlibrary) {
    providers.push({
      label: "Open Library",
      search: (query) => methods.searchOpenLibrary(query),
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

function installInstanceEnhancements(plugin: SearchEnhancedPlugin): void {
  if (INSTALLED_PLUGINS.has(plugin)) return;
  INSTALLED_PLUGINS.add(plugin);
  const methods = runtimeMethods(plugin);

  methods.searchExternal = async (mediaType, query) => {
    const response = await searchMultilingualProviders({
      query,
      providers: providersFor(plugin, mediaType),
      languages: plugin.settings.searchLanguages,
      maxResults: 24,
    });
    return { results: response.results, warnings: response.warnings };
  };

  const originalCreateMediaNote = createMediaNoteMethod(plugin);
  methods.createMediaNote = async (result, form) => {
    const created: unknown = await originalCreateMediaNote.call(plugin, result, form);
    if (!(created instanceof TFile)) throw new Error("AnimeList createMediaNote returned an invalid file.");
    const aliases = aliasesFor(result);
    if (aliases.length) {
      try {
        await plugin.app.fileManager.processFrontMatter(created, (frontmatter) => {
          const existing = stringArray(frontmatter.title_aliases);
          frontmatter.title_aliases = [...new Set([...existing, ...aliases])];
        });
      } catch (error) {
        console.warn("AnimeList could not persist title aliases", error);
      }
    }
    return created;
  };
}

function renderDuplicateWarning(
  plugin: SearchEnhancedPlugin,
  modal: LegacyAddMediaModal,
  result: ExternalMediaResult,
): void {
  modal.contentEl.querySelector(".al-duplicate-warning")?.remove();
  const form = modal.contentEl.querySelector(".al-media-form");
  if (!form || result.mediaType !== "anime") return;
  const duplicate = findConfidentDuplicate(result, collectStoredMedia(plugin));
  if (!duplicate) return;

  const warning = createEl("section");
  warning.className = "al-modal-warning al-duplicate-warning";
  const title = createEl("strong");
  title.textContent = searchFeatureText("duplicate.warning.title");
  const description = createEl("p");
  description.textContent = searchFeatureText("duplicate.warning.description", { title: duplicate.title });
  const open = createEl("button");
  open.type = "button";
  open.className = "al-secondary-button";
  open.textContent = searchFeatureText("duplicate.warning.open");
  open.addEventListener("click", () => {
    void plugin.app.workspace.openLinkText(duplicate.filePath, "", false);
  });
  warning.append(title, description, open);
  form.insertAdjacentElement("beforebegin", warning);
}

function captureLegacyModal(openLegacyModal: () => void): LegacyAddMediaModal | null {
  const openDescriptor = Object.getOwnPropertyDescriptor(Modal.prototype, "open");
  const originalModalOpen: unknown = openDescriptor?.value;
  if (!openDescriptor || typeof originalModalOpen !== "function") return null;
  let captured: LegacyAddMediaModal | null = null;
  Modal.prototype.open = function openAndCapture(this: Modal): void {
    Reflect.apply(originalModalOpen, this, []);
    const candidate = this as Partial<LegacyAddMediaModal>;
    if (this.modalEl.classList.contains("animelist-modal") && typeof candidate.renderDetails === "function") {
      captured = candidate as LegacyAddMediaModal;
    }
  };
  try {
    openLegacyModal();
  } finally {
    Object.defineProperty(Modal.prototype, "open", openDescriptor);
  }
  return captured;
}

function installDuplicateWarning(
  plugin: SearchEnhancedPlugin,
  modal: LegacyAddMediaModal,
): void {
  const originalRenderDetails = modal.renderDetails;
  modal.renderDetails = async (result) => {
    await originalRenderDetails.call(modal, result);
    renderDuplicateWarning(plugin, modal, result);
  };
}

const prototype = LegacyAnimeListPlugin.prototype as unknown as AddModalPrototype;
if (prototype[PATCH_MARKER] !== true) {
  const originalOpenAddModal = prototype.openAddModal;
  prototype.openAddModal = function openAddModalWithSearchEnhancements(
    this: SearchEnhancedPlugin,
    initialType = "anime",
  ): void {
    installInstanceEnhancements(this);
    const modal = captureLegacyModal(() => {
      originalOpenAddModal.call(this, initialType);
    });
    if (modal) installDuplicateWarning(this, modal);
  };
  Object.defineProperty(prototype, PATCH_MARKER, { value: true });
}

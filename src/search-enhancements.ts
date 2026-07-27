import { TFile } from "obsidian";
import type { AddMediaModalContext } from "./app/feature-registry";
import type { AnimeListPluginHost } from "./app/plugin-host";
import { findConfidentDuplicate, type StoredMediaIdentity } from "./duplicate-detection";
import {
  searchMultilingualProviders,
  type SearchProviderAdapter,
} from "./multilingual-search";
import { searchFeatureText } from "./search-feature-text";
import type {
  AnimeListSettings,
  ExternalMediaResult,
  MediaType,
} from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

interface SearchEnhancedPlugin extends AnimeListPluginHost {
  settings: AnimeListSettings;
  getScanFolders(): string[];
  searchBangumi(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  searchOpenLibrary(query: string): Promise<ExternalMediaResult[]>;
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
  return getScopedMarkdownFiles(plugin.app, plugin.getScanFolders()).flatMap((file) => {
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
      supportsChineseDiscovery: true,
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

function renderDuplicateWarning(
  plugin: SearchEnhancedPlugin,
  modal: AddMediaModalContext["modal"],
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

export function installSearchEnhancements(plugin: SearchEnhancedPlugin): void {
  plugin.features.registerExternalSearch({
    id: "multilingual-search",
    order: 0,
    search: async ({ mediaType, query }) => {
      const response = await searchMultilingualProviders({
        query,
        providers: providersFor(plugin, mediaType),
        languages: plugin.settings.searchLanguages,
        maxResults: 24,
      });
      return { results: response.results, warnings: response.warnings };
    },
  });

  plugin.features.registerMediaForm({
    id: "search-title-aliases",
    afterCreate: async (context, created) => {
      if (!(created instanceof TFile) || !context.result) return;
      const aliases = aliasesFor(context.result);
      if (!aliases.length) return;
      try {
        await plugin.app.fileManager.processFrontMatter(created, (frontmatter) => {
          const existing = stringArray(frontmatter.title_aliases);
          frontmatter.title_aliases = [...new Set([...existing, ...aliases])];
        });
      } catch (error) {
        console.warn("AnimeList could not persist title aliases", error);
      }
    },
  });

  plugin.features.registerAddMedia({
    id: "duplicate-warning",
    order: 20,
    afterDetailsRender: ({ modal }, result) => {
      renderDuplicateWarning(plugin, modal, result);
    },
  });
}

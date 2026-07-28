import { defineFeature, type AnimeListFeatureHost } from "./app/feature-types";
import { findConfidentDuplicate, type StoredMediaIdentity } from "./duplicate-detection";
import { searchFeatureText } from "./search-feature-text";
import type { MediaType } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

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

function collectStoredMedia(plugin: AnimeListFeatureHost): StoredMediaIdentity[] {
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
      mediaType: mediaType as MediaType,
      format: stringValue(frontmatter.format),
      year: typeof frontmatter.year === "number" || typeof frontmatter.year === "string" ? frontmatter.year : "",
      total: numberValue(frontmatter.progress_total),
      provider: stringValue(frontmatter.source_provider),
      sourceId: stringValue(frontmatter.source_id),
      sourceUrls: stringArray(frontmatter.source_urls),
    }];
  });
}

export const searchEnhancementsFeature = defineFeature<AnimeListFeatureHost>({
  id: "search-enhancements",
  contributions: [{
    kind: "media-form",
    configure(context): void {
      if (context.mode !== "create" || context.mediaType !== "anime" || !context.result) return;
      const duplicate = findConfidentDuplicate(context.result, collectStoredMedia(context.host));
      if (!duplicate) return;

      const warning = createEl("section", { cls: "al-modal-warning al-duplicate-warning" });
      const title = warning.createEl("strong", { text: searchFeatureText("duplicate.warning.title") });
      const description = warning.createEl("p", {
        text: searchFeatureText("duplicate.warning.description", { title: duplicate.title }),
      });
      const open = warning.createEl("button", {
        cls: "al-secondary-button",
        text: searchFeatureText("duplicate.warning.open"),
      });
      open.type = "button";
      open.addEventListener("click", () => void context.host.openMediaFile(duplicate.filePath));
      warning.append(title, description, open);
      context.formEl.insertAdjacentElement("beforebegin", warning);
    },
  }],
});

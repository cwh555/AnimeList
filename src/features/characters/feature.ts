import { Notice, TFile } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "../../app/feature-types";
import { CharacterLibraryService } from "../../data/character-library-service";
import { CharacterPickerModal } from "../../ui/characters/character-picker";
import { renderCharacterPage } from "../../ui/characters/character-page";
import { appendIconLabel, makeEl } from "../../ui/ui-helpers";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { bindImageFallback } from "../../ui/image-fallback";
import { characterText as t } from "./text";
import { CharacterNoteCard } from "../../ui/characters/character-note-card";
import { bangumiSubjectId } from "../../domain/characters/work-source";
import { characterRankingStoreForApp } from "../../data/characters/ranking-store";
import { externalImagesForHost } from "../../data/characters/external-image-service";

const services = new WeakMap<object, CharacterLibraryService>();
export function characterService(host: AnimeListFeatureHost): CharacterLibraryService {
  let service = services.get(host);
  if (!service) {
    service = new CharacterLibraryService(host.app, () => host.settings.libraryRoot);
    services.set(host, service);
  }
  return service;
}

export const characterFeature = {
  id: "characters",
  dependsOn: ["image-sections"],
  contributions: [{
    kind: "lifecycle" as const,
    activate(host: AnimeListFeatureHost) {
      host.registerMarkdownCodeBlockProcessor("animelist-character", (_source, element, context) => {
        context.addChild(new CharacterNoteCard(element, host, context.sourcePath));
      });
      host.register(() => externalImagesForHost(host).dispose());
      host.addCommand({
        id: "open-characters",
        name: t("title"),
        callback: () => { void host.openLibrarySection("characters"); },
      });
      const ranking = characterRankingStoreForApp(host.app);
      host.registerEvent(host.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile) || typeof oldPath !== "string") return;
        if (oldPath.includes("/Characters/")) {
          characterService(host).renameCharacterPath(oldPath, file.path);
          void ranking.rename(oldPath, file.path).catch(error => {
            new Notice(t("failed", { reason: error instanceof Error ? error.message : "Unknown error" }));
          });
        } else {
          void characterService(host).renameAppearance(oldPath, file.path).catch(error => {
            new Notice(t("failed", { reason: error instanceof Error ? error.message : "Unknown error" }));
          });
        }
      }));
      host.registerEvent(host.app.vault.on("create", file => {
        if (file instanceof TFile && file.path.includes("/Characters/")) host.refreshViews();
      }));
      host.registerEvent(host.app.vault.on("delete", file => {
        if (!(file instanceof TFile) || !file.path.includes("/Characters/")) return;
        host.refreshViews();
        void ranking.remove(file.path).catch(error => {
          new Notice(t("failed", { reason: error instanceof Error ? error.message : "Unknown error" }));
        });
      }));
      host.registerEvent(host.app.metadataCache.on("changed", file => {
        if (file instanceof TFile && file.path.includes("/Characters/")) host.refreshViews();
      }));
    },
  }, {
    kind: "workspace-page" as const,
    page(host: AnimeListFeatureHost) {
      return {
        id: "characters" as const, label: t("title"), icon: "contact-round", order: 35,
        render: (container: HTMLElement, context: import("../../ui/workspace-contracts").WorkspacePageRenderContext) =>
          renderCharacterPage(host, characterService(host), container, context),
      };
    },
  }, {
    kind: "detail" as const,
    afterRender({ host, container, sourcePath, frontmatter }: {
      host: AnimeListFeatureHost; container: HTMLElement; sourcePath: string;
      frontmatter: Record<string, unknown>;
    }) {
      if (frontmatter.media_type !== "anime"
        && frontmatter.media_type !== "manga"
        && frontmatter.media_type !== "novel") return;
      const section = makeEl("section", "al-character-work-section");
      const header = makeEl("div", "al-character-work-heading");
      header.appendChild(makeEl("h3", "", t("related")));
      const subjectId = bangumiSubjectId(frontmatter);
      const choose = makeEl("button", "al-secondary-button al-character-work-add");
      choose.type = "button";
      appendIconLabel(choose, "plus", t("showCast"));
      header.appendChild(choose);
      section.appendChild(header);
      const row = makeEl("div", "al-character-work-list");
      section.appendChild(row);
      const mount = container.querySelector<HTMLElement>(".al-detail-body") ?? container;
      mount.appendChild(section);
      const renderLinked = async (): Promise<void> => {
        const records = await characterService(host).list();
        if (!section.isConnected) return;
        const related = records.filter(record => record.appearances.includes(sourcePath));
        row.replaceChildren();
        if (!related.length) row.appendChild(makeEl("p", "al-character-work-empty", t("workEmpty")));
        for (const character of related) {
          const open = makeEl("button", "al-character-work-person");
          open.type = "button";
          const imageWrap = makeEl("span", "al-character-work-portrait");
          const cover = imageSectionServiceForHost(host).resolve(character.portrait, character.path);
          const src = cover.thumbnailSources?.src || cover.resourcePath;
          if (src) {
            const img = makeEl("img");
            img.alt = character.name;
            img.loading = "lazy";
            bindImageFallback(img, () => makeEl("span", "al-character-cover-fallback", "—"));
            imageWrap.appendChild(img);
            img.src = src;
          } else imageWrap.appendChild(makeEl("span", "al-character-cover-fallback", "—"));
          open.append(imageWrap, makeEl("span", "al-character-work-name", character.name));
          open.addEventListener("click", () => {
            void characterService(host).ensureVisibleWorks(character.path).then(() => host.openMediaFile(character.path))
              .catch(error => new Notice(t("failed", { reason: error instanceof Error ? error.message : "Unknown error" })));
          });
          row.appendChild(open);
        }
      };
      choose.addEventListener("click", () => {
        new CharacterPickerModal(host, characterService(host), sourcePath, subjectId, async () => {
          await renderLinked();
        }).open();
      });
      void renderLinked().catch(error => {
        if (section.isConnected) new Notice(t("failed", {
          reason: error instanceof Error ? error.message : "Unknown error",
        }));
      });
    },
  }],
} satisfies AnimeListFeature<AnimeListFeatureHost>;

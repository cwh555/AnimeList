import { Notice, TFile } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "../../app/feature-types";
import { CharacterLibraryService } from "../../data/character-library-service";
import { CharacterPickerModal } from "../../ui/characters/character-picker";
import { renderCharacterPage } from "../../ui/characters/character-page";
import { makeEl } from "../../ui/ui-helpers";
import { characterText as t } from "./text";

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
      host.addCommand({
        id: "open-characters",
        name: t("title"),
        callback: () => { void host.openLibrarySection("characters"); },
      });
      host.registerEvent(host.app.vault.on("create", file => {
        if (file instanceof TFile && file.path.includes("/Characters/")) host.refreshViews();
      }));
      host.registerEvent(host.app.vault.on("delete", file => {
        if (file instanceof TFile && file.path.includes("/Characters/")) host.refreshViews();
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
      section.appendChild(makeEl("h3", "", t("related")));
      const row = makeEl("div", "al-character-work-list");
      section.appendChild(row);
      const subjectId = frontmatter.source_provider === "bangumi"
        ? typeof frontmatter.source_id === "string" || typeof frontmatter.source_id === "number"
          ? String(frontmatter.source_id) : "" : "";
      const choose = makeEl("button", "al-secondary-button", t("showCast"));
      choose.type = "button";
      choose.addEventListener("click", () =>
        new CharacterPickerModal(host, characterService(host), sourcePath, subjectId).open());
      section.appendChild(choose);
      container.appendChild(section);
      void characterService(host).list().then(items => {
        if (!section.isConnected) return;
        const relevant = items.filter(item => item.appearances.includes(sourcePath));
        for (const character of relevant) {
          const open = makeEl("button", "al-character-work-person", character.name);
          open.type = "button";
          open.addEventListener("click", () => { void host.openMediaFile(character.path); });
          row.appendChild(open);
        }
      }).catch(error => {
        if (section.isConnected) new Notice(t("failed", {
          reason: error instanceof Error ? error.message : String(error),
        }));
      });
    },
  }],
} satisfies AnimeListFeature<AnimeListFeatureHost>;

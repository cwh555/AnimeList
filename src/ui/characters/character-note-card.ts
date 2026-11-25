import { MarkdownRenderChild, TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import { characterFromFrontmatter } from "../../domain/characters/character";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { bindImageFallback } from "../image-fallback";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

/** Character note uses the same native Markdown + Image Sections as every AnimeList note. */
export class CharacterNoteCard extends MarkdownRenderChild {
  constructor(
    container: HTMLElement,
    private readonly host: AnimeListFeatureHost,
    private readonly notePath: string,
  ) { super(container); }

  onload(): void {
    this.render();
    this.registerEvent(this.host.app.metadataCache.on("changed", file => {
      if (file instanceof TFile && file.path === this.notePath) this.render();
    }));
  }

  private render(): void {
    const file = this.host.app.vault.getAbstractFileByPath(this.notePath);
    const record = file instanceof TFile
      ? characterFromFrontmatter(this.host.app.metadataCache.getFileCache(file)?.frontmatter, file.path)
      : null;
    this.containerEl.replaceChildren();
    if (!record) return;
    const card = makeEl("section", "al-detail-card al-character-note-card");
    const frame = makeEl("div", "al-character-note-cover");
    const resolved = imageSectionServiceForHost(this.host).resolve(record.portrait, record.path);
    const source = resolved.thumbnailSources?.src || resolved.resourcePath;
    if (source) {
      const img = makeEl("img");
      img.alt = record.name;
      img.loading = "lazy";
      bindImageFallback(img, () => makeEl("span", "al-character-cover-fallback", t("noPortrait")));
      img.src = source;
      frame.appendChild(img);
    } else frame.appendChild(makeEl("span", "al-character-cover-fallback", t("noPortrait")));
    const body = makeEl("div", "al-character-note-summary");
    body.appendChild(makeEl("span", "al-character-note-label", t("level")));
    body.appendChild(makeEl("strong", "al-character-note-tier", t(record.tier)));
    if (record.appearances.length) {
      body.appendChild(makeEl("span", "al-character-note-label", t("works")));
      const titles = new Map(this.host.collectMediaItems().map(item => [item.filePath, item.title]));
      const workLinks = makeEl("div", "al-character-note-work-links");
      for (const path of record.appearances) {
        const work = makeEl("button", "al-secondary-button", titles.get(path)
          ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path);
        work.type = "button";
        work.addEventListener("click", () => { void this.host.openMediaFile(path); });
        workLinks.appendChild(work);
      }
      body.appendChild(workLinks);
    }
    card.append(frame, body);
    this.containerEl.appendChild(card);
  }
}

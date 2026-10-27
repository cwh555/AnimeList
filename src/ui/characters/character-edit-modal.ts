import { Menu, Notice } from "obsidian";
import { AnimeListModal } from "../animelist-modal";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterLibraryService } from "../../data/character-library-service";
import type { CharacterRecord, CharacterTier } from "../../domain/characters/character";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { bindImageFallback } from "../image-fallback";
import { CharacterRemoveModal } from "./character-remove-modal";
import { appendIconLabel, makeEl, setAnimeListIcon } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

const message = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

/**
 * The editor is deliberately small. Images are managed by the existing
 * Markdown Image Sections; their "Set as cover" menu is the only cover picker.
 */
export class CharacterEditModal extends AnimeListModal {
  private busy = false;

  constructor(
    private readonly host: AnimeListFeatureHost,
    private readonly service: CharacterLibraryService,
    private readonly character: CharacterRecord,
    private readonly openGallery: () => void,
  ) { super(host.app); }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-character-edit-modal");
    const content = this.contentEl;
    content.replaceChildren();
    const heading = makeEl("div", "al-character-edit-heading");
    heading.appendChild(makeEl("h2", "", t("editCharacter")));
    const more = makeEl("button", "al-character-editor-more");
    more.type = "button";
    more.title = t("removeCharacter");
    more.setAttribute("aria-label", more.title);
    setAnimeListIcon(more, "ellipsis");
    more.addEventListener("click", event => {
      const menu = new Menu();
      menu.addItem(item => item.setTitle(t("removeCharacter")).setIcon("trash")
        .setWarning(true).onClick(() => {
          new CharacterRemoveModal(this.host, this.service, this.character, () => {
            this.close();
            this.host.refreshViews();
          }).open();
        }));
      menu.showAtMouseEvent(event);
    });
    heading.appendChild(more);
    content.appendChild(heading);

    const name = makeEl("input");
    name.type = "text";
    name.value = this.character.name;
    name.setAttribute("aria-label", t("displayName"));
    const tier = makeEl("select");
    tier.setAttribute("aria-label", t("level"));
    for (const value of ["liked", "high", "top"] as const) {
      const option = makeEl("option", "", t(value));
      option.value = value;
      tier.appendChild(option);
    }
    tier.value = this.character.tier;
    const field = (label: string, input: HTMLElement): HTMLElement => {
      const el = makeEl("label", "al-character-edit-field");
      el.append(makeEl("span", "", label), input);
      return el;
    };
    const information = makeEl("div", "al-character-edit-information");
    const imageFrame = makeEl("div", "al-character-edit-current-cover");
    const resolved = imageSectionServiceForHost(this.host).resolve(
      this.character.portrait, this.character.path,
    );
    const src = resolved.thumbnailSources?.src || resolved.resourcePath;
    if (src) {
      const image = makeEl("img");
      image.alt = this.character.name;
      image.loading = "lazy";
      bindImageFallback(image, () => makeEl("span", "al-character-cover-fallback", t("noPortrait")));
      image.src = src;
      imageFrame.appendChild(image);
    } else imageFrame.appendChild(makeEl("span", "al-character-cover-fallback", t("noPortrait")));
    const fields = makeEl("div", "al-character-edit-fields");
    fields.append(field(t("displayName"), name), field(t("level"), tier));
    const titles = new Map(this.host.collectMediaItems().map(item => [item.filePath, item.title]));
    if (this.character.appearances.length) {
      fields.appendChild(makeEl("div", "al-character-edit-works",
        t("works") + "： " + this.character.appearances.map(
          path => titles.get(path) ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
        ).join(" · ")));
    }
    information.append(imageFrame, fields);
    content.appendChild(information);

    const cover = makeEl("section", "al-character-edit-cover-link");
    cover.appendChild(makeEl("h3", "", t("currentPortrait")));
    cover.appendChild(makeEl("p", "", t("galleryCoverHelp")));
    const goto = makeEl("button", "al-secondary-button");
    goto.type = "button";
    appendIconLabel(goto, "images", t("openGalleryToCover"));
    goto.addEventListener("click", () => {
      if (this.busy) return;
      if (name.value.trim() !== this.character.name || tier.value !== this.character.tier) {
        new Notice(t("saveBeforeGallery"));
        return;
      }
      this.close();
      this.openGallery();
    });
    cover.appendChild(goto);
    content.appendChild(cover);

    const actions = makeEl("div", "al-character-edit-actions");
    const cancel = makeEl("button", "al-secondary-button", t("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const save = makeEl("button", "mod-cta", t("saveChanges"));
    save.type = "button";
    save.addEventListener("click", () => {
      if (this.busy) return;
      const nextName = name.value.trim();
      if (!nextName) { name.focus(); return; }
      this.busy = true;
      save.disabled = true;
      void (async () => {
        if (nextName !== this.character.name) await this.service.setName(this.character.path, nextName);
        if (tier.value !== this.character.tier) await this.service.setTier(this.character.path, tier.value as CharacterTier);
        this.host.refreshViews();
        this.close();
      })().catch(error => new Notice(t("failed", { reason: message(error) })))
        .finally(() => { this.busy = false; save.disabled = false; });
    });
    actions.append(cancel, save);
    content.appendChild(actions);
  }

  onClose(): void { this.contentEl.replaceChildren(); }
}

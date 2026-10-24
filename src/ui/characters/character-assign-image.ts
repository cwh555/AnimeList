import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { CharacterPickerModal } from "./character-picker";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

/** Reuse the same characters and Image Sections from both the global Gallery and Characters. */
export class CharacterImageAssignmentModal extends Modal {
  constructor(
    private readonly host: AnimeListFeatureHost,
    private readonly library: CharacterLibraryService,
    private readonly imagePath: string,
  ) { super(host.app); }

  onOpen(): void {
    void this.show();
  }
  private async show(): Promise<void> {
    this.contentEl.replaceChildren(makeEl("h2", "", t("assignToCharacter")));
    const characters = await this.library.list();
    if (!this.modalEl.isConnected) return;
    const grid = makeEl("div", "al-character-assign-list");
    for (const character of characters) {
      const btn = makeEl("button", "al-secondary-button", character.name);
      btn.type = "button";
      btn.addEventListener("click", () => { void this.assign(character.path); });
      grid.appendChild(btn);
    }
    this.contentEl.appendChild(grid);
    const add = makeEl("button", "mod-cta", t("manual"));
    add.type = "button";
    add.addEventListener("click", () => {
      new CharacterPickerModal(this.host, this.library, undefined, undefined, async path => {
        await this.library.attachImage(path, this.imagePath);
        this.host.refreshViews();
      }).open();
      this.close();
    });
    this.contentEl.appendChild(add);
  }
  private async assign(path: string): Promise<void> {
    try {
      await this.library.attachImage(path, this.imagePath);
      this.host.refreshViews();
      this.close();
      new Notice(t("saved"));
    } catch (error) {
      new Notice(t("failed", {
        reason: error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error",
      }));
    }
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}

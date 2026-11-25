import { Notice } from "obsidian";
import { AnimeListModal } from "../animelist-modal";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterRecord } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

/** Confirm destructive scope: only character note is trashed; shared image files survive. */
export class CharacterRemoveModal extends AnimeListModal {
  private busy = false;
  constructor(
    host: AnimeListFeatureHost,
    private readonly service: CharacterLibraryService,
    private readonly character: CharacterRecord,
    private readonly onRemoved: () => void,
  ) { super(host.app); }
  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-character-remove-modal");
    this.contentEl.replaceChildren(
      makeEl("h3", "", t("removeCharacter")),
      makeEl("p", "", t("removeConfirm", { name: this.character.name })),
    );
    const actions = makeEl("div", "al-character-remove-actions");
    const cancel = makeEl("button", "", t("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const remove = makeEl("button", "mod-warning", t("removeCharacter"));
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (this.busy) return;
      this.busy = true;
      remove.disabled = true;
      void this.service.remove(this.character.path).then(() => {
        this.close();
        this.onRemoved();
      }).catch(error => {
        this.busy = false;
        remove.disabled = false;
        new Notice(t("failed", {
          reason: error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error",
        }));
      });
    });
    actions.append(cancel, remove);
    this.contentEl.appendChild(actions);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}

import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterCandidate } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { BangumiCharacterClient } from "../../data/providers/bangumi-character-client";
import { AnimeListModal } from "../animelist-modal";
import { bindImageFallback } from "../image-fallback";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

const api = new BangumiCharacterClient();

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
}

/** Search is explicit: no request burst while the user is typing. */
export class CharacterPickerModal extends AnimeListModal {
  private revision = 0;
  constructor(
    private readonly host: AnimeListFeatureHost,
    private readonly library: CharacterLibraryService,
    private readonly appearance?: string,
    private readonly subjectId?: string,
  ) { super(host.app); }

  onOpen(): void {
    this.modalEl.addClass("al-character-picker-modal");
    this.contentEl.replaceChildren();
    this.contentEl.appendChild(makeEl("h2", "", t("add")));
    const searchRow = makeEl("div", "al-character-picker-search");
    const query = makeEl("input");
    query.type = "search";
    query.placeholder = t("search");
    query.setAttribute("aria-label", t("search"));
    const find = makeEl("button", "mod-cta", t("find"));
    find.type = "button";
    const results = makeEl("div", "al-character-picker-results");
    const search = async (): Promise<void> => {
      const term = query.value.trim();
      if (!term) return;
      const revision = ++this.revision;
      results.replaceChildren(makeEl("p", "", t("loading")));
      try {
        const candidates = await api.search(term);
        if (revision !== this.revision) return;
        await this.renderCandidates(results, candidates.map(item => ({ ...item, appearance: this.appearance })));
      } catch (error) {
        if (revision === this.revision) results.replaceChildren(makeEl("p", "", t("failed", { reason: message(error) })));
      }
    };
    find.addEventListener("click", () => { void search(); });
    query.addEventListener("keydown", event => { if (event.key === "Enter") void search(); });
    searchRow.append(query, find);
    this.contentEl.appendChild(searchRow);

    const manualRow = makeEl("div", "al-character-picker-search");
    const manual = makeEl("input");
    manual.placeholder = t("name");
    manual.setAttribute("aria-label", t("name"));
    const add = makeEl("button", "", t("manual"));
    add.type = "button";
    add.addEventListener("click", () => {
      const name = manual.value.trim();
      if (!name) return;
      void this.collect({ name, appearance: this.appearance }, add);
    });
    manualRow.append(manual, add);
    this.contentEl.append(manualRow, results);
    if (this.subjectId && /^[1-9]\d*$/.test(this.subjectId)) {
      results.replaceChildren(makeEl("p", "", t("loading")));
      const revision = ++this.revision;
      void api.fromSubject(this.subjectId, this.appearance ?? "").then(
        characters => {
          if (revision !== this.revision) return;
          void this.renderCandidates(results, characters).catch(error => {
            if (revision === this.revision) results.replaceChildren(makeEl("p", "", t("failed", { reason: message(error) })));
          });
        },
        error => {
          if (revision === this.revision) results.replaceChildren(makeEl("p", "", t("failed", { reason: message(error) })));
        },
      );
    } else if (this.appearance) {
      results.appendChild(makeEl("p", "al-character-hint", t("unavailable")));
    }
  }

  onClose(): void {
    this.revision += 1;
    this.contentEl.replaceChildren();
  }

  private async collect(candidate: CharacterCandidate, button: HTMLButtonElement): Promise<void> {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await this.library.collect(candidate);
      button.textContent = t("collected");
      this.host.refreshViews();
      new Notice(t("saved"));
    } catch (error) {
      button.disabled = false;
      new Notice(t("failed", { reason: message(error) }));
    }
  }

  private async renderCandidates(container: HTMLElement, entries: CharacterCandidate[]): Promise<void> {
    const current = await this.library.list();
    if (!container.isConnected) return;
    container.replaceChildren();
    if (!entries.length) {
      container.appendChild(makeEl("p", "", t("noResults")));
      return;
    }
    const grid = makeEl("div", "al-character-candidate-grid");
    for (const candidate of entries) {
      const card = makeEl("article", "al-character-candidate");
      if (candidate.portrait) {
        const image = makeEl("img");
        image.alt = candidate.name;
        image.loading = "lazy";
        bindImageFallback(image, () => makeEl("div", "al-character-placeholder", "☆"));
        card.appendChild(image);
        image.src = candidate.portrait;
      } else card.appendChild(makeEl("div", "al-character-placeholder", "☆"));
      card.appendChild(makeEl("div", "al-character-candidate-name", candidate.name));
      if (candidate.relation) card.appendChild(makeEl("small", "", candidate.relation));
      const existing = candidate.bangumiId && current.some(item => item.bangumiId === candidate.bangumiId);
      const button = makeEl("button", "", existing ? t("collected") : t("collect"));
      button.type = "button";
      button.disabled = Boolean(existing);
      button.addEventListener("click", () => { void this.collect(candidate, button); });
      card.appendChild(button);
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }
}

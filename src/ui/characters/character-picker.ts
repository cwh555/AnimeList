import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterCandidate } from "../../domain/characters/character";
import { characterCollectionAction } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { BangumiCharacterClient } from "../../data/providers/bangumi-character-client";
import { AnimeListModal } from "../animelist-modal";
import { bindImageFallback } from "../image-fallback";
import { makeEl, setAnimeListIcon } from "../ui-helpers";
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
    private readonly afterCollect?: (path: string) => Promise<void>,
  ) { super(host.app); }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-character-picker-modal");
    this.contentEl.replaceChildren();
    this.contentEl.appendChild(makeEl("h2", "", t("add")));
    const searchRow = makeEl("div", "al-character-picker-search al-search");
    const searchIcon = makeEl("span", "al-icon");
    setAnimeListIcon(searchIcon, "search");
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
    searchRow.append(searchIcon, query, find);
    this.contentEl.appendChild(searchRow);

    const manualRow = makeEl("div", "al-character-picker-search al-character-manual-row");
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
      const record = await this.library.collect(candidate);
      await this.afterCollect?.(record.path);
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
    const grid = makeEl("div", "al-character-candidate-grid al-grid is-poster");
    for (const candidate of entries) {
      const card = makeEl("article", "al-card al-character-candidate");
      const media = makeEl("div", "al-cover-wrap");
      if (candidate.portrait) {
        const image = makeEl("img", "al-cover");
        image.alt = candidate.name;
        image.loading = "lazy";
        image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
        bindImageFallback(image, () => makeEl("div", "al-cover-missing", t("noPortrait")));
        media.appendChild(image);
        image.src = candidate.portrait;
      } else media.appendChild(makeEl("div", "al-cover-missing", t("noPortrait")));
      media.appendChild(makeEl("div", "al-cover-shade"));
      const info = makeEl("div", "al-card-body");
      info.appendChild(makeEl("h2", "al-card-title", candidate.name));
      if (candidate.relation) info.appendChild(makeEl("div", "al-facts", candidate.relation));
      const action = characterCollectionAction(current, candidate);
      const collect = makeEl("button", "al-secondary-button al-character-candidate-action",
        action === "link" ? t("linkWork") : action === "collected" ? t("collected") : t("collect"));
      collect.type = "button";
      collect.disabled = action === "collected";
      collect.addEventListener("click", event => {
        event.stopPropagation();
        void this.collect(candidate, collect);
      });
      card.tabIndex = action === "collected" ? -1 : 0;
      if (action !== "collected") {
        card.setAttribute("role", "button");
        card.addEventListener("click", event => {
          if ((event.target as HTMLElement).closest("button")) return;
          void this.collect(candidate, collect);
        });
        card.addEventListener("keydown", event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          void this.collect(candidate, collect);
        });
      }
      info.appendChild(collect);
      card.append(media, info);
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }
}

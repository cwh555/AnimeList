import { setIcon, type App } from "obsidian";
import { AnimeListModal } from "../animelist-modal";
import { makeEl, errorMessage } from "../ui-helpers";
import { rankingCover } from "./cover";
import type { MediaItem, MediaType } from "../../domain/media-types";
import {
  decideRanking, nextRankingPair, reconcileRanking,
  type RankingCollection,
} from "../../domain/pairwise-ranking";
import type { PairwiseRankingStore } from "../../data/pairwise-ranking/store";
import { rankingText as t } from "../../features/pairwise-ranking/text";

export interface RankingComparisonOptions {
  store: PairwiseRankingStore;
  type: MediaType;
  eligible: readonly MediaItem[];
  onClose(): void;
  onError(message: string): void;
}

function action(label: string, icon: string, invoke: () => void): HTMLButtonElement {
  const button = makeEl("button", "al-ranking-dialog-action");
  button.type = "button";
  const symbol = makeEl("span");
  setIcon(symbol, icon);
  button.append(symbol, makeEl("span", "", label));
  button.addEventListener("click", invoke);
  return button;
}

/** Comparison is a focused Obsidian dialog; the list remains untouched behind it. */
export class RankingComparisonModal extends AnimeListModal {
  private readonly items: Map<string, MediaItem>;
  private list: RankingCollection | null = null;
  private busy = false;
  private closed = false;
  /** Session-only reversible choices; never save an undo-history structure. */
  private readonly previous: Array<{ before: RankingCollection; after: RankingCollection }> = [];

  constructor(app: App, private readonly options: RankingComparisonOptions) {
    super(app);
    this.items = new Map(options.eligible.map((item) => [item.filePath, item]));
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-ranking-comparison-modal");
    void this.refresh();
  }

  onClose(): void {
    this.closed = true;
    this.contentEl.empty();
    // The native X can close the dialog while a choice is being saved.
    // Defer notifying the panel until that mutation has finished, so it
    // never races a stale reload against the outstanding write.
    if (!this.busy) this.options.onClose();
  }

  private async refresh(): Promise<void> {
    try {
      // Persist inferred (previously answered) steps before displaying a pair.
      // This keeps the modal's undo snapshots byte-for-byte aligned with the
      // saved collection and avoids replaying a question already proven.
      const state = await this.options.store.mutate((draft) => {
        reconcileRanking(draft[this.options.type], this.options.eligible);
      });
      this.list = structuredClone(state[this.options.type]);
      if (!this.closed) this.render();
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const reason = errorMessage(error);
    this.options.onError(t("failed", { reason }));
    if (!this.closed) this.close();
  }

  private async change(edit: (list: RankingCollection) => void): Promise<void> {
    if (this.busy || this.closed) return;
    this.busy = true;
    const before = structuredClone(this.list);
    this.contentEl.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
    try {
      const next = await this.options.store.mutate((state) => {
        reconcileRanking(state[this.options.type], this.options.eligible);
        edit(state[this.options.type]);
      });
      this.list = next[this.options.type];
      if (before && JSON.stringify(before) !== JSON.stringify(this.list)) {
        this.previous.push({ before, after: structuredClone(this.list) });
      }
      if (!this.closed) this.render();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (this.closed) this.options.onClose();
    }
  }

  /** Undo exactly one persisted choice if no other writer has changed the state.
   * The commit is reversed atomically through the existing serialized store.
   */
  private async back(): Promise<void> {
    if (this.busy || this.closed) return;
    const step = this.previous.at(-1);
    if (!step) return;
    this.busy = true;
    this.contentEl.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    try {
      const state = await this.options.store.mutate(draft => {
        if (JSON.stringify(draft[this.options.type]) !== JSON.stringify(step.after)) {
          throw new Error("Ranking changed after this comparison; cannot undo stale data.");
        }
        draft[this.options.type] = structuredClone(step.before);
      });
      this.previous.pop();
      this.list = structuredClone(state[this.options.type]);
      if (!this.closed) this.render();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      if (this.closed) this.options.onClose();
    }
  }

  private render(): void {
    if (!this.list || this.closed) return;
    const pair = nextRankingPair(this.list);
    if (!pair && !this.previous.length) { this.close(); return; }
    const { contentEl } = this;
    contentEl.replaceChildren();
    const round = this.list.round;
    const heading = makeEl("h2", "al-ranking-dialog-title",
      round ? t("round", { count: round.stage }) : t("compare"));
    const progress = round ? makeEl("p", "al-ranking-dialog-progress",
      t("roundProgress", { done: round.comparisons, count: round.total })) : null;
    const choices = makeEl("div", "al-ranking-choices");
    for (const [path, answer] of pair
      ? [[pair.candidate, "better"], [pair.reference, "worse"]] as const
      : []) {
      const item = this.items.get(path);
      const name = item?.title ?? path;
      const card = makeEl("button", "al-ranking-choice");
      card.type = "button";
      card.title = name;
      card.setAttribute("aria-label", name);
      card.append(
        rankingCover(item, "al-ranking-choice-cover"),
        makeEl("span", "al-ranking-choice-title", name),
      );
      card.addEventListener("click", () => {
        void this.change((list) => { decideRanking(list, this.options.eligible, answer, pair ?? undefined); });
      });
      choices.appendChild(card);
    }
    const toolbar = makeEl("div", "al-ranking-dialog-toolbar");
    if (pair) {
      const skip = action(t("skip"), "skip-forward", () => {
        void this.change((list) => { decideRanking(list, this.options.eligible, "skip", pair ?? undefined); });
      });
      skip.addClass("al-ranking-skip");
      toolbar.append(skip);
    }
    const back = action(t("back"), "arrow-left", () => { void this.back(); });
    back.addClass("al-ranking-back");
    back.disabled = this.previous.length === 0;
    toolbar.append(back);
    const pause = action(pair ? t("pause") : t("finish"), pair ? "pause" : "check", () => this.close());
    toolbar.append(pause);
    contentEl.append(heading);
    if (progress) contentEl.append(progress);
    if (pair) contentEl.append(choices);
    contentEl.append(toolbar);
    const first = choices.querySelector<HTMLButtonElement>("button");
    first?.focus();
  }
}

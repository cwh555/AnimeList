import { setIcon, type App } from "obsidian";
import { AnimeListModal } from "../animelist-modal";
import { makeEl, errorMessage } from "../ui-helpers";
import { rankingCover } from "./cover";
import type { MediaItem, MediaType } from "../../domain/media-types";
import {
  decideRanking, nextRankingPair, reconcileRanking, undoRanking, roundProgress,
  type RankingChoice, type RankingCollection,
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
    this.options.onClose();
  }

  private async refresh(): Promise<void> {
    try {
      const state = await this.options.store.load();
      this.list = JSON.parse(JSON.stringify(state[this.options.type])) as RankingCollection;
      reconcileRanking(this.list, this.options.eligible);
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
    this.contentEl.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
    try {
      const next = await this.options.store.mutate((state) => {
        reconcileRanking(state[this.options.type], this.options.eligible);
        edit(state[this.options.type]);
      });
      this.list = next[this.options.type];
      if (this.closed) this.options.onClose();
      else this.render();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
    }
  }

  private render(): void {
    if (!this.list || this.closed) return;
    const pair = nextRankingPair(this.list);
    if (!pair) { this.close(); return; }
    const { contentEl } = this;
    contentEl.replaceChildren();
    const round = this.list.round;
    const heading = makeEl("h2", "al-ranking-dialog-title",
      round ? t("round", { count: round.stage }) : t("compare"));
    const progress = round ? makeEl("p", "al-ranking-dialog-progress",
      t("roundProgress", { done: round.comparisons, count: round.total })) : null;
    const choices = makeEl("div", "al-ranking-choices");
    for (const [path, answer] of [[pair.candidate, "better"], [pair.reference, "worse"]] as const) {
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
        void this.change((list) => { decideRanking(list, this.options.eligible, answer as RankingChoice); });
      });
      choices.appendChild(card);
    }
    const toolbar = makeEl("div", "al-ranking-dialog-toolbar");
    const undo = action(t("undo"), "undo-2", () => {
      void this.change((list) => { undoRanking(list); });
    });
    undo.disabled = this.list.history.length === 0;
    const skip = action(t("skip"), "skip-forward", () => {
      void this.change((list) => { decideRanking(list, this.options.eligible, "skip"); });
    });
    skip.addClass("al-ranking-skip");
    const pause = action(t("pause"), "pause", () => this.close());
    toolbar.append(undo, skip, pause);
    contentEl.append(heading);
    if (progress) contentEl.append(progress);
    contentEl.append(choices, toolbar);
    const first = choices.querySelector<HTMLButtonElement>("button");
    first?.focus();
  }
}

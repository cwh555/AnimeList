import { Modal, setIcon, type App } from "obsidian";
import type { MediaItem, MediaType } from "../../domain/media-types";
import {
  completedRankingItems, moveRankedItem, nextRankingPair, prepareRankingRounds,
  prepareRanking, rankingBounds, rankingCounts,
  reconcileRanking, undoRanking, placePendingItem, resumePendingRanking,
  type RankingCollection, type RankingState,
} from "../../domain/pairwise-ranking";
import type { PairwiseRankingStore } from "../../data/pairwise-ranking/store";
import { rankingText as t } from "../../features/pairwise-ranking/text";
import { makeEl } from "../ui-helpers";
import { rankingCover } from "./cover";
import { RankingComparisonModal } from "./comparison-modal";
import { installRankingDrag } from "./drag";

// The workspace scroll host survives list rebuilds; keep searches with it.
const RANKING_QUERIES = new WeakMap<HTMLElement, string>();

interface RankingPanelOptions {
  app: App;
  store: PairwiseRankingStore;
  items: readonly MediaItem[];
  type: MediaType;
  setType(value: MediaType): void;
  redraw(): void;
  openNote(path: string): Promise<void>;
  showNotice(message: string): void;
}

function button(label: string, action: () => void, icon?: string, className = ""): HTMLButtonElement {
  const el = makeEl("button", className, label);
  el.type = "button";
  if (icon) {
    el.textContent = "";
    const glyph = makeEl("span");
    setIcon(glyph, icon);
    el.append(glyph, makeEl("span", "", label));
  }
  el.addEventListener("click", action);
  return el;
}

class RankingConfirmModal extends Modal {
  constructor(app: App, private readonly confirm: () => void) { super(app); }
  onOpen(): void {
    const body = this.contentEl;
    body.empty();
    body.createEl("h3", { text: t("resetTitle") });
    body.createEl("p", { text: t("resetDetails") });
    const actions = makeEl("div", "al-ranking-modal-actions");
    actions.append(
      button(t("cancel"), () => this.close()),
      button(t("confirm"), () => { this.close(); this.confirm(); }, "alert-triangle", "mod-warning"),
    );
    body.appendChild(actions);
  }
}

class RankingMoveModal extends Modal {
  constructor(
    app: App,
    private readonly count: number,
    private readonly position: number,
    private readonly accept: (rank: number) => void,
  ) { super(app); }
  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: t("moveTitle") });
    const label = makeEl("label", "al-ranking-move-label", t("moveHint", { count: this.count }));
    const input = makeEl("input");
    input.type = "number";
    input.min = "1";
    input.max = String(this.count);
    input.step = "1";
    input.value = String(this.position);
    label.append(input);
    const error = makeEl("p", "al-ranking-error");
    const controls = makeEl("div", "al-ranking-modal-actions");
    const apply = (): void => {
      const rank = Number(input.value);
      if (!Number.isInteger(rank) || rank < 1 || rank > this.count) {
        error.textContent = t("moveInvalid");
        return;
      }
      this.close();
      this.accept(rank);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); apply(); }
    });
    controls.append(button(t("cancel"), () => this.close()), button(t("confirm"), apply));
    this.contentEl.append(label, error, controls);
    input.focus();
    input.select();
  }
}

class RankingRangeModal extends Modal {
  constructor(
    app: App,
    private readonly count: number,
    private readonly apply: (first: number, last: number) => void,
  ) { super(app); }
  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: t("range") });
    const inputs = makeEl("div", "al-ranking-range-inputs");
    const fields = [t("from"), t("to")].map((label, index) => {
      const wrapper = makeEl("label", "al-ranking-move-label", label);
      const input = makeEl("input");
      input.type = "number";
      input.min = "1";
      input.max = String(this.count);
      input.value = String(index === 0 ? 1 : this.count);
      wrapper.append(input);
      inputs.append(wrapper);
      return input;
    });
    const error = makeEl("p", "al-ranking-error");
    const controls = makeEl("div", "al-ranking-modal-actions");
    controls.append(
      button(t("cancel"), () => this.close()),
      button(t("confirm"), () => {
        const from = Number(fields[0].value);
        const to = Number(fields[1].value);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > this.count || to <= from) {
          error.textContent = t("rangeInvalid");
          return;
        }
        this.close();
        this.apply(from, to);
      }, undefined, "mod-cta"),
    );
    this.contentEl.append(inputs, error, controls);
    fields[0].focus();
  }
}

export async function renderRankingPanel(container: HTMLElement, options: RankingPanelOptions): Promise<void> {
  const searchHost = container.closest<HTMLElement>(".al-workspace-page-body") ?? container;
  container.replaceChildren(makeEl("p", "al-ranking-loading", t("busy")));
  const eligible = completedRankingItems(options.items, options.type);
  let state: RankingState;
  try {
    // A view refresh must never irreversibly delete ranking state: a rename may
    // temporarily precede the index/metadata refresh. Reconcile only the view.
    state = JSON.parse(JSON.stringify(await options.store.load())) as RankingState;
    reconcileRanking(state[options.type], eligible);
  } catch (error) {
    container.replaceChildren(makeEl("p", "al-ranking-error", t("failed", {
      reason: error instanceof Error ? error.message : String(error),
    })));
    return;
  }
  if (!container.isConnected) return;
  const list = state[options.type];
  const byPath = new Map(eligible.map((item) => [item.filePath, item]));
  const counts = rankingCounts(list, eligible);
  const pair = nextRankingPair(list);
  const panel = makeEl("section", "al-ranking-panel");
  container.replaceChildren(panel);
  let busy = false;

  const compare = (): void => {
    new RankingComparisonModal(options.app, {
      store: options.store,
      type: options.type,
      eligible,
      onClose: () => options.redraw(),
      onError: (message) => options.showNotice(message),
    }).open();
  };
  const mutate = async (edit: (list: RankingCollection) => void, compareAfter = false): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const saved = await options.store.mutate((draft) => {
        reconcileRanking(draft[options.type], eligible);
        edit(draft[options.type]);
      });
      options.redraw();
      if (compareAfter && nextRankingPair(saved[options.type])) compare();
    } catch (error) {
      options.showNotice(t("failed", { reason: error instanceof Error ? error.message : String(error) }));
    } finally {
      busy = false;
    }
  };
  const start = (mode: "new" | "pending" | "reset"): void => {
    void mutate((draft) => { prepareRanking(draft, eligible, mode); }, true);
  };

  const header = makeEl("header", "al-ranking-header");
  const typeTabs = makeEl("nav", "al-ranking-type-tabs");
  typeTabs.setAttribute("aria-label", t("title"));
  for (const type of ["anime", "manga", "novel"] as const) {
    const tab = button(t(type), () => {
      RANKING_QUERIES.delete(searchHost);
      options.setType(type);
    }, undefined, type === options.type ? "is-active" : "");
    tab.setAttribute("aria-pressed", String(type === options.type));
    typeTabs.appendChild(tab);
  }
  const stats = makeEl("div", "al-ranking-stats");
  stats.append(
    makeEl("span", "", t("ranked", { count: counts.ranked })),
    makeEl("span", "", t("unranked", { count: counts.unranked })),
    makeEl("span", counts.pending ? "has-pending" : "", t("pending", { count: counts.pending })),
  );
  header.append(typeTabs, stats);
  panel.appendChild(header);

  if (!eligible.length) {
    panel.appendChild(makeEl("p", "al-ranking-empty", t("noCompleted")));
    return;
  }

  const actions = makeEl("div", "al-ranking-actions");
  if (pair) actions.appendChild(button(t("continue"), compare, "play", "mod-cta"));
  else if (counts.unranked) {
    actions.appendChild(button(list.ordered.length ? t("newWorks") : t("start"), () => {
      if (list.ordered.length === 0 || counts.unranked > 1) {
        void mutate((draft) => {
          prepareRankingRounds(draft, eligible, list.ordered.length ? "append" : "full");
        }, true);
      } else start("new");
    }, "play", "mod-cta"));
  }
  if (counts.pending) actions.appendChild(button(t("resolve"), () => start("pending"), "refresh-cw"));
  if (list.ordered.length >= 2 && !list.round) {
    actions.appendChild(button(t("range"), () => {
      new RankingRangeModal(options.app, list.ordered.length, (first, last) => {
        void mutate((draft) => { prepareRankingRounds(draft, eligible, "range", first, last); }, true);
      }).open();
    }, "list-ordered"));
  }
  if (list.history.length) actions.appendChild(button(t("undo"), () => {
    void mutate((draft) => { undoRanking(draft); });
  }, "undo-2"));
  if (list.ordered.length || list.round) {
    actions.appendChild(button(t("reset"), () => {
      new RankingConfirmModal(options.app, () => {
        void mutate((draft) => {
          draft.round = null;
          prepareRankingRounds(draft, eligible, "full");
        }, true);
      }).open();
    }, "rotate-ccw", "al-ranking-reset"));
  }
  panel.appendChild(actions);

  if (counts.pending) panel.appendChild(makeEl("p", "al-ranking-warning", t("warning")));
  const search = makeEl("input", "al-ranking-search");
  search.type = "search";
  search.placeholder = t("search");
  search.setAttribute("aria-label", t("search"));
  search.value = RANKING_QUERIES.get(searchHost) ?? "";
  panel.appendChild(search);

  const result = makeEl("ol", "al-ranking-list");
  const rows: HTMLElement[] = [];
  for (const [index, path] of list.ordered.entries()) {
    const item = byPath.get(path);
    if (!item) continue;
    const row = makeEl("li", "al-ranking-row");
    row.dataset.title = item.title.toLocaleLowerCase();
    row.append(makeEl("span", "al-ranking-position", String(index + 1)));
    const content = button("", () => { void options.openNote(path); }, undefined, "al-ranking-open");
    content.title = item.title;
    content.append(rankingCover(item, "al-ranking-row-cover"), makeEl("span", "al-ranking-row-title", item.title));
    row.appendChild(content);
    const handle = button("", () => undefined, "grip-vertical", "al-ranking-handle");
    handle.setAttribute("aria-label", t("drag", { title: item.title }));
    handle.title = t("drag", { title: item.title });
    row.appendChild(handle);
    const moveButton = button("", () => {
      new RankingMoveModal(options.app, list.ordered.length, index + 1, (rank) => {
        void mutate((draft) => { moveRankedItem(draft, path, rank); });
      }).open();
    }, "arrow-up-down", "al-ranking-move");
    moveButton.setAttribute("aria-label", t("moveTo"));
    moveButton.title = t("moveTo");
    row.appendChild(moveButton);
    rows.push(row);
    result.appendChild(row);
    installRankingDrag(handle, row, rows, index + 1, (rank) => {
      void mutate((draft) => { moveRankedItem(draft, path, rank); });
    });
  }
  panel.appendChild(result);
  if (!list.ordered.length) panel.appendChild(makeEl("p", "al-ranking-empty", t("empty")));
  const applySearch = (): void => {
    const q = search.value.trim().toLocaleLowerCase();
    for (const row of rows) {
      row.hidden = Boolean(q) && !row.dataset.title?.includes(q);
      // Filtered positions do not correspond to global ranks: use Move to rank instead.
      const handle = row.querySelector<HTMLButtonElement>(".al-ranking-handle");
      if (handle) handle.disabled = Boolean(q);
    }
  };
  search.addEventListener("input", () => {
    RANKING_QUERIES.set(searchHost, search.value);
    applySearch();
  });
  applySearch();

  if (counts.pending) {
    const pendingSection = makeEl("section", "al-ranking-pending");
    pendingSection.append(makeEl("h3", "", t("pendingTitle")));
    for (const [path, attempt] of Object.entries(list.pending)) {
      const item = byPath.get(path);
      if (!item) continue;
      const bounds = rankingBounds(list, attempt);
      const row = makeEl("div", "al-ranking-pending-row");
      const label = makeEl("div", "al-ranking-pending-label");
      label.append(rankingCover(item, "al-ranking-row-cover"), makeEl("strong", "", item.title));
      const possible = bounds.first === bounds.last
        ? t("onePosition", { first: bounds.first + 1 })
        : t("possible", { first: bounds.first + 1, last: bounds.last + 1 });
      const info = makeEl("span", "al-ranking-pending-bounds", possible);
      const retry = button(t("retry"), () => {
        void mutate((draft) => {
          resumePendingRanking(draft, eligible, path);
        }, true);
      }, "refresh-cw");
      const place = button(t("moveTo"), () => {
        new RankingMoveModal(options.app, list.ordered.length + 1, list.ordered.length + 1, (rank) => {
          void mutate((draft) => { placePendingItem(draft, path, rank); });
        }).open();
      }, "list-ordered");
      row.append(label, info, retry, place);
      pendingSection.appendChild(row);
    }
    panel.appendChild(pendingSection);
  }
}

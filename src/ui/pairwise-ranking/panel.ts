import { Menu, Modal, setIcon, type App } from "obsidian";
import type { MediaItem, MediaType } from "../../domain/media-types";
import {
  completedRankingItems, moveRankedItem, rankingDropPosition, nextRankingPair,
  prepareRanking, rankingBounds, rankingCounts, recompareRankedItem,
  reconcileRanking, undoRanking, emptyRankingCollection, placePendingItem, resumePendingRanking,
  type RankingCollection, type RankingState,
} from "../../domain/pairwise-ranking";
import type { PairwiseRankingStore } from "../../data/pairwise-ranking/store";
import { rankingText as t } from "../../features/pairwise-ranking/text";
import { makeEl } from "../ui-helpers";
import { rankingCover } from "./cover";
import { RankingComparisonModal } from "./comparison-modal";

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

function installReorderHandle(
  handle: HTMLButtonElement, row: HTMLElement, rows: HTMLElement[],
  from: number, moved: (position: number) => void,
): void {
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moved(from + (event.key === "ArrowUp" ? -1 : 1));
  });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = event.pointerId;
    let destination = from;
    const highlight = (target: number): void => {
      rows.forEach((entry, index) => entry.classList.toggle("is-rank-target", index === target - 1));
      destination = target;
    };
    row.classList.add("is-rank-moving");
    handle.setPointerCapture(pointer);
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointer) return;
      const scrollHost = row.closest<HTMLElement>(".al-workspace-page-body")
        ?? row.closest<HTMLElement>(".view-content");
      if (scrollHost) {
        const rect = scrollHost.getBoundingClientRect();
        if (next.clientY < rect.top + 38) scrollHost.scrollTop -= 16;
        if (next.clientY > rect.bottom - 38) scrollHost.scrollTop += 16;
      }
      const bounds = rows.map((entry) => entry.getBoundingClientRect());
      const target = rankingDropPosition(bounds, from - 1, next.clientY);
      highlight(target);
    };
    const finish = (commit: boolean): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", cancel);
      row.classList.remove("is-rank-moving");
      rows.forEach((entry) => entry.classList.remove("is-rank-target"));
      if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
      if (commit && from !== destination) moved(destination);
    };
    const done = (up: PointerEvent): void => { if (up.pointerId === pointer) finish(true); };
    const cancel = (up: PointerEvent): void => { if (up.pointerId === pointer) finish(false); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", cancel);
  });
}

export async function renderRankingPanel(container: HTMLElement, options: RankingPanelOptions): Promise<void> {
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
    const tab = button(t(type), () => options.setType(type), undefined, type === options.type ? "is-active" : "");
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
  if (pair) {
    actions.appendChild(button(t("continue"), compare, "play", "mod-cta"));
  } else if (counts.unranked) {
    actions.appendChild(button(list.ordered.length ? t("newWorks") : t("start"), () => start("new"), "play", "mod-cta"));
  }
  if (counts.pending) actions.appendChild(button(t("resolve"), () => start("pending"), "refresh-cw"));
  if (list.history.length) actions.appendChild(button(t("undo"), () => {
    void mutate((draft) => { undoRanking(draft); });
  }, "undo-2"));
  const more = button(t("more"), () => {
    const menu = new Menu();
    menu.addItem((entry) => entry.setTitle(t("reset")).setIcon("rotate-ccw").onClick(() => {
      new RankingConfirmModal(options.app, () => {
        void mutate((draft) => {
          Object.assign(draft, emptyRankingCollection());
          prepareRanking(draft, eligible, "new");
        }, true);
      }).open();
    }));
    const rect = more.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  }, "ellipsis");
  actions.appendChild(more);
  panel.appendChild(actions);

  if (counts.pending) panel.appendChild(makeEl("p", "al-ranking-warning", t("warning")));
  const search = makeEl("input", "al-ranking-search");
  search.type = "search";
  search.placeholder = t("search");
  search.setAttribute("aria-label", t("search"));
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
    const menuButton = button("", () => {
      const menu = new Menu();
      menu.addItem((entry) => entry.setTitle(t("openNote")).setIcon("file-text")
        .onClick(() => { void options.openNote(path); }));
      menu.addItem((entry) => entry.setTitle(t("moveTo")).setIcon("list-ordered")
        .onClick(() => new RankingMoveModal(options.app, list.ordered.length, index + 1, (rank) => {
          void mutate((draft) => { moveRankedItem(draft, path, rank); });
        }).open()));
      menu.addItem((entry) => entry.setTitle(t("recompare")).setIcon("git-compare")
        .onClick(() => {
          void mutate((draft) => {
            // A separate unfinished comparison must not disappear on single-item recompare.
            if (draft.active) draft.pending[draft.active.path] = draft.active;
            recompareRankedItem(draft, path);
            draft.active = { path, comparisons: {} };
            delete draft.pending[path];
          }, true);
        }));
      const rect = menuButton.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }, "ellipsis", "al-ranking-more");
    menuButton.setAttribute("aria-label", t("more"));
    row.appendChild(menuButton);
    rows.push(row);
    result.appendChild(row);
    installReorderHandle(handle, row, rows, index + 1, (rank) => {
      void mutate((draft) => { moveRankedItem(draft, path, rank); });
    });
  }
  panel.appendChild(result);
  if (!list.ordered.length) panel.appendChild(makeEl("p", "al-ranking-empty", t("empty")));
  search.addEventListener("input", () => {
    const q = search.value.trim().toLocaleLowerCase();
    for (const row of rows) {
      row.hidden = Boolean(q) && !row.dataset.title?.includes(q);
      // Filtered positions do not correspond to global ranks: use Move to rank instead.
      const handle = row.querySelector<HTMLButtonElement>(".al-ranking-handle");
      if (handle) handle.disabled = Boolean(q);
    }
  });

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

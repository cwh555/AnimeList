import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterRecord } from "../../domain/characters/character";
import { characterRankingItems } from "../../domain/characters/ranking-items";
import { prepareRanking, prepareRankingRounds, reconcileRanking, nextRankingPair,
  rankingPositionProjection, emptyRankingCollection, type RankingCollection,
} from "../../domain/pairwise-ranking";
import type { CharacterRankingStore } from "../../data/characters/ranking-store";
import { CharacterRankingAdapter } from "../../data/characters/ranking-adapter";
import { RankingComparisonModal } from "../pairwise-ranking/comparison-modal";
import { rankingCover } from "../pairwise-ranking/cover";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { AnimeListModal } from "../animelist-modal";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
}

function action(label: string, callback: () => void, style = "al-secondary-button"): HTMLButtonElement {
  const element = makeEl("button", style, label);
  element.type = "button";
  element.addEventListener("click", callback);
  return element;
}

class RankingResetModal extends AnimeListModal {
  constructor(host: AnimeListFeatureHost, private readonly confirm: () => void) { super(host.app); }
  onOpen(): void {
    this.modalEl.addClass("animelist-modal");
    this.contentEl.replaceChildren(
      makeEl("h3", "", t("restartRanking")),
      makeEl("p", "", t("restartConfirm")),
    );
    const controls = makeEl("div", "al-ranking-modal-actions");
    controls.append(
      action(t("cancel"), () => this.close()),
      action(t("restartRanking"), () => { this.close(); this.confirm(); }, "mod-warning"),
    );
    this.contentEl.appendChild(controls);
  }
}

/** Character ranking is a thin view adapter over the same AnimeList Ranking UI. */
export async function renderCharacterRanking(
  container: HTMLElement, host: AnimeListFeatureHost,
  store: CharacterRankingStore, characters: readonly CharacterRecord[],
  redraw: () => void, open: (path: string) => void,
): Promise<void> {
  const service = imageSectionServiceForHost(host);
  const eligible = characterRankingItems(characters).map(item => {
    const image = service.resolve(item.cover, item.filePath);
    return { ...item, cover: image.thumbnailSources?.src || image.resourcePath || "" };
  });
  container.replaceChildren(makeEl("p", "al-ranking-loading", t("loading")));
  const persisted = eligible.length ? await store.load() : null;
  if (!container.isConnected) return;
  const list: RankingCollection = persisted
    ? structuredClone(persisted)
    : emptyRankingCollection();
  reconcileRanking(list, eligible);
  const projection = rankingPositionProjection(list, eligible);
  const bounds = new Map(projection.possible.map(entry => [entry.path, entry]));
  const confirmed = new Set(projection.confirmed.map(entry => entry.path));
  const byPath = new Map(eligible.map(item => [item.filePath, item]));
  const pair = nextRankingPair(list);
  const missing = eligible.some(item => !list.ordered.includes(item.filePath)
    && !Object.hasOwn(list.pending, item.filePath) && list.active?.path !== item.filePath);
  const shell = makeEl("section", "al-ranking-panel al-character-ranking-panel");
  const head = makeEl("header", "al-ranking-header");
  head.appendChild(makeEl("h2", "", t("ranking")));
  const stats = makeEl("div", "al-ranking-stats");
  stats.append(
    makeEl("span", "", t("rankedCount", { count: projection.confirmed.length })),
    makeEl("span", "", t("pendingCount", { count: eligible.length - projection.confirmed.length })),
  );
  head.appendChild(stats);
  shell.appendChild(head);
  container.replaceChildren(shell);
  let busy = false;
  const adapter = new CharacterRankingAdapter(store);
  const compare = (): void => {
    new RankingComparisonModal(host.app, {
      store: adapter, type: "anime", eligible,
      onClose: redraw,
      onError(message) { new Notice(message); },
    }).open();
  };
  const change = async (edit: (list: RankingCollection) => void, thenCompare = false): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const next = await store.mutate(draft => {
        reconcileRanking(draft, eligible);
        edit(draft);
      });
      redraw();
      if (thenCompare && nextRankingPair(next)) compare();
    } catch (error) {
      new Notice(t("failed", { reason: errorText(error) }));
    } finally { busy = false; }
  };
  const controls = makeEl("div", "al-ranking-actions");
  if (pair) controls.appendChild(action(t("continueRanking"), compare, "mod-cta"));
  else if (missing && eligible.length > 1) controls.appendChild(action(t("beginRanking"), () => {
    void change(draft => { prepareRankingRounds(draft, eligible, draft.ordered.length ? "append" : "full"); }, true);
  }, "mod-cta"));
  if (Object.keys(list.pending).length) controls.appendChild(action(t("resolveRanking"), () => {
    void change(draft => { prepareRanking(draft, eligible, "pending"); }, true);
  }));
  if (list.ordered.length || list.round) controls.appendChild(action(t("restartRanking"), () =>
    new RankingResetModal(host, () => {
      void change(draft => { draft.round = null; prepareRankingRounds(draft, eligible, "full"); }, true);
    }).open(),
  ));
  shell.appendChild(controls);
  const positions = makeEl("ol", "al-ranking-list al-character-ranking-list");
  for (const entry of projection.confirmed) {
    const item = byPath.get(entry.path);
    if (!item) continue;
    const row = makeEl("li", "al-ranking-row al-character-ranking-row");
    row.appendChild(makeEl("span", "al-ranking-position al-character-rank", "#" + entry.position));
    const button = action("", () => open(entry.path), "al-ranking-open");
    button.append(rankingCover(item, "al-ranking-row-cover"), makeEl("span", "al-ranking-row-title", item.title));
    row.appendChild(button);
    positions.appendChild(row);
  }
  shell.appendChild(positions);
  if (confirmed.size !== eligible.length) {
    const pending = makeEl("section", "al-ranking-pending");
    pending.appendChild(makeEl("h3", "", t("resolveRanking")));
    for (const item of eligible) {
      if (confirmed.has(item.filePath)) continue;
      const row = makeEl("div", "al-ranking-pending-row al-character-ranking-row");
      const boundsFor = bounds.get(item.filePath);
      const text = boundsFor ? "#" + boundsFor.first + "–" + boundsFor.last : "—";
      row.appendChild(makeEl("span", "al-character-rank", text));
      const entry = action("", () => open(item.filePath), "al-ranking-open");
      entry.append(rankingCover(item, "al-ranking-row-cover"), makeEl("span", "al-ranking-row-title", item.title));
      row.appendChild(entry);
      pending.appendChild(row);
    }
    shell.appendChild(pending);
  }
  if (!eligible.length) shell.appendChild(makeEl("p", "al-ranking-empty", t("empty")));
}

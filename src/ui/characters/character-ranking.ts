import { Modal, Notice, TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import { characterRankingItems } from "../../domain/characters/ranking-items";
import type { CharacterRecord } from "../../domain/characters/character";
import { decideRanking, nextRankingPair, prepareRanking, prepareRankingRounds,
  rankingPositionProjection, reconcileRanking, type RankingCollection, type RankingPair,
} from "../../domain/pairwise-ranking";
import type { CharacterRankingStore } from "../../data/characters/ranking-store";
import { bindImageFallback } from "../image-fallback";
import { makeEl } from "../ui-helpers";
import { characterText as t } from "../../features/characters/text";

function message(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
}
function action(name: string, callback: () => void): HTMLButtonElement {
  const button = makeEl("button", "al-secondary-button", name);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}
function face(record: CharacterRecord, host: AnimeListFeatureHost): HTMLElement {
  const box = makeEl("div", "al-character-compare-cover");
  let src = record.portrait;
  if (src && !/^https?:\/\//i.test(src)) {
    const file = host.app.metadataCache.getFirstLinkpathDest(src, record.path)
      ?? host.app.vault.getAbstractFileByPath(src);
    src = file instanceof TFile ? host.app.vault.getResourcePath(file) : "";
  }
  if (src) {
    const img = makeEl("img");
    img.alt = record.name;
    bindImageFallback(img, () => makeEl("span", "al-character-cover-fallback", "☆"));
    box.appendChild(img);
    img.src = src;
  } else box.appendChild(makeEl("span", "al-character-cover-fallback", "☆"));
  return box;
}
class CharacterComparisonModal extends Modal {
  private busy = false;
  constructor(
    private readonly host: AnimeListFeatureHost,
    private readonly store: CharacterRankingStore,
    private readonly characters: readonly CharacterRecord[],
    private readonly onCloseDone: () => void,
  ) { super(host.app); }
  onOpen(): void { void this.render(); }
  onClose(): void { this.onCloseDone(); }
  private async render(): Promise<void> {
    const list = await this.store.load();
    const items = characterRankingItems(this.characters);
    const snapshot = JSON.parse(JSON.stringify(list)) as RankingCollection;
    reconcileRanking(snapshot, items);
    const pair = nextRankingPair(snapshot);
    this.contentEl.replaceChildren();
    if (!pair) { this.close(); return; }
    const candidates = new Map(this.characters.map(record => [record.path, record]));
    const first = candidates.get(pair.candidate), second = candidates.get(pair.reference);
    if (!first || !second) { this.close(); return; }
    this.contentEl.append(makeEl("h3", "", t("comparePrompt")));
    const cards = makeEl("div", "al-character-compare-pair");
    const choose = (record: CharacterRecord, preference: "better" | "worse"): HTMLButtonElement => {
      const button = action("", () => { void this.answer(preference, pair); });
      button.classList.add("al-character-compare-choice");
      button.append(face(record, this.host), makeEl("strong", "", record.name));
      return button;
    };
    cards.append(choose(first, "better"), choose(second, "worse"));
    this.contentEl.append(cards, action(t("skip"), () => { void this.answer("skip", pair); }));
  }
  private async answer(choice: "better" | "worse" | "skip", expected: RankingPair): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const eligible = characterRankingItems(this.characters);
      await this.store.mutate(list => {
        reconcileRanking(list, eligible);
        decideRanking(list, eligible, choice, expected);
      });
      await this.render();
    } catch (error) {
      new Notice(t("failed", { reason: message(error) }));
      this.close();
    } finally { this.busy = false; }
  }
}
export async function renderCharacterRanking(
  container: HTMLElement, host: AnimeListFeatureHost,
  store: CharacterRankingStore, characters: readonly CharacterRecord[],
  redraw: () => void, open: (path: string) => void,
): Promise<void> {
  container.replaceChildren();
  const eligible = characterRankingItems(characters);
  const collection = await store.load();
  if (!container.isConnected) return;
  const list = JSON.parse(JSON.stringify(collection)) as RankingCollection;
  reconcileRanking(list, eligible);
  const projection = rankingPositionProjection(list, eligible);
  const head = makeEl("div", "al-character-ranking-head");
  head.appendChild(makeEl("h2", "", t("ranking")));
  const controls = makeEl("div", "al-character-ranking-actions");
  let busy = false;
  const compare = (): void => new CharacterComparisonModal(host, store, characters, redraw).open();
  const change = async (edit: (list: RankingCollection) => void, thenCompare = false): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const saved = await store.mutate(draft => { reconcileRanking(draft, eligible); edit(draft); });
      redraw();
      if (thenCompare && nextRankingPair(saved)) compare();
    } catch (error) { new Notice(t("failed", { reason: message(error) })); }
    finally { busy = false; }
  };
  if (nextRankingPair(list)) controls.appendChild(action(t("continueRanking"), compare));
  else if (characters.some(c => !list.ordered.includes(c.path) && !Object.hasOwn(list.pending, c.path))) {
    controls.appendChild(action(t("beginRanking"), () => {
      void change(draft => { prepareRankingRounds(draft, eligible, draft.ordered.length ? "append" : "full"); }, true);
    }));
  }
  if (Object.keys(list.pending).length) controls.appendChild(action(t("resolveRanking"), () => {
    void change(draft => { prepareRanking(draft, eligible, "pending"); }, true);
  }));
  if (list.ordered.length || list.round) controls.appendChild(action(t("restartRanking"), () => {
    // Explicit re-ranking only. No automatic reset on library refresh.
    const modal = new Modal(host.app);
    modal.contentEl.appendChild(makeEl("h3", "", t("restartRanking")));
    modal.contentEl.appendChild(makeEl("p", "", t("restartConfirm")));
    modal.contentEl.append(action(t("cancel"), () => modal.close()), action(t("restartRanking"), () => {
      modal.close();
      void change(draft => { draft.round = null; prepareRankingRounds(draft, eligible, "full"); }, true);
    }));
    modal.open();
  }));
  head.appendChild(controls);
  container.appendChild(head);
  const positions = new Map(projection.possible.map(p => [p.path, p]));
  const confirmed = new Map(projection.confirmed.map(p => [p.path, p.position]));
  const rows = makeEl("div", "al-character-ranking-list");
  for (const record of characters) {
    const position = confirmed.get(record.path), bounds = positions.get(record.path);
    const row = action(record.name, () => open(record.path));
    row.classList.add("al-character-ranking-row");
    const positionText = position != null ? "#" + position
      : bounds ? "#" + bounds.first + "–" + bounds.last : "—";
    row.prepend(makeEl("span", "al-character-rank", positionText));
    rows.appendChild(row);
  }
  container.appendChild(rows);
}

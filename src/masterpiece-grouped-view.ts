import type {
  LibraryRenderAdapters,
  LibraryRenderState,
} from "./app/feature-registry";
import type { MediaItem } from "./domain/media-types";
import {
  SPECIAL_LABEL_FILTER,
  groupMasterpieceItems,
  normalizeSpecialLabelMode,
} from "./masterpiece-labels";

interface GroupedMediaItem extends MediaItem {
  masterpieceLabels?: unknown;
}

interface GroupedCardItem extends GroupedMediaItem {
  card: HTMLElement;
}

function itemIdentity(item: MediaItem): string {
  return `${item.title}\u0000${item.originalTitle ?? ""}`;
}

function cardIdentity(card: HTMLElement): string {
  const title = card.querySelector(".al-card-title")?.textContent ?? "";
  const originalTitle = card.querySelector(".al-original-title")?.textContent ?? "";
  return `${title}\u0000${originalTitle}`;
}

function bindClonedCard(
  card: HTMLElement,
  item: MediaItem,
  adapters: LibraryRenderAdapters,
): void {
  card.dataset.path = item.filePath;
  card.addEventListener("click", () => adapters.openFile?.(item.filePath));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    adapters.openFile?.(item.filePath);
  });

  const favoriteButton = card.querySelector<HTMLButtonElement>(".al-favorite-button");
  favoriteButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    favoriteButton.disabled = true;
    void Promise.resolve(adapters.toggleFavorite?.(item.filePath, !item.favorite))
      .finally(() => { favoriteButton.disabled = false; });
  });

  const editButton = card.querySelector<HTMLButtonElement>(".al-edit-button");
  editButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    adapters.editItem?.(item.filePath);
  });
}

function resolveVisibleItems(
  cards: HTMLElement[],
  inputItems: GroupedMediaItem[],
): GroupedCardItem[] {
  const byPath = new Map(inputItems.map((item) => [item.filePath, item]));
  const byIdentity = new Map<string, GroupedMediaItem[]>();
  for (const item of inputItems) {
    const key = itemIdentity(item);
    const values = byIdentity.get(key) ?? [];
    values.push(item);
    byIdentity.set(key, values);
  }

  return cards.flatMap((card) => {
    const path = card.dataset.path ?? "";
    const item = byPath.get(path) ?? byIdentity.get(cardIdentity(card))?.shift();
    if (!item) return [];
    card.dataset.path = item.filePath;
    return [{ ...item, card }];
  });
}

function cloneCard(card: HTMLElement): HTMLElement | null {
  const cloned = card.cloneNode(true);
  return cloned.nodeType === Node.ELEMENT_NODE ? cloned as HTMLElement : null;
}

export function renderMasterpieceGroups(
  container: HTMLElement,
  inputItems: GroupedMediaItem[],
  adapters: LibraryRenderAdapters,
  state: LibraryRenderState,
  mode: unknown,
): void {
  if (normalizeSpecialLabelMode(mode) !== "masterpiece") return;
  if (state.status !== SPECIAL_LABEL_FILTER) return;

  const root = container.querySelector<HTMLElement>(".al-grid");
  if (!root) return;
  const cards = [...root.querySelectorAll<HTMLElement>(":scope > .al-card")];
  if (!cards.length) return;

  const visibleItems = resolveVisibleItems(cards, inputItems);
  const groups = groupMasterpieceItems(visibleItems);
  if (!groups.length) return;

  root.className = "al-masterpiece-groups";
  root.replaceChildren();
  const usedPaths = new Set<string>();

  for (const group of groups) {
    const section = root.createEl("section", { cls: "al-masterpiece-group" });
    section.dataset.groupKey = group.key;

    const heading = section.createDiv({ cls: "al-masterpiece-group-heading" });
    heading.createEl("h2", { cls: "al-masterpiece-group-title", text: group.label });
    heading.createSpan({ cls: "al-masterpiece-group-count", text: String(group.items.length) });

    const grid = section.createDiv({
      cls: `al-grid is-${state.view ?? "grid"} al-masterpiece-group-grid`,
    });
    for (const entry of group.items) {
      let card = entry.card;
      if (usedPaths.has(entry.filePath)) {
        const cloned = cloneCard(entry.card);
        if (!cloned) continue;
        card = cloned;
        bindClonedCard(card, entry, adapters);
      } else {
        usedPaths.add(entry.filePath);
      }
      grid.appendChild(card);
    }
  }
}

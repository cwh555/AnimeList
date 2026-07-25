import { AnimeListUI } from "./legacy";
import type AnimeListPlugin from "./main";
import type { MediaItem } from "./types";
import {
  SPECIAL_LABEL_FILTER,
  groupMasterpieceItems,
  normalizeSpecialLabelMode,
} from "./masterpiece-labels";

interface MasterpieceSettings {
  specialLabelMode?: "favorite" | "masterpiece";
}

type MasterpiecePlugin = AnimeListPlugin & {
  settings: AnimeListPlugin["settings"] & MasterpieceSettings;
};

interface LibraryState {
  status?: string;
  view?: string;
}

interface LibraryAdapters {
  openFile?: (path: string) => void;
  editItem?: (path: string) => void;
  toggleFavorite?: (path: string, next: boolean) => Promise<void> | void;
  onStateChange?: (state: LibraryState) => void;
  [key: string]: unknown;
}

interface GroupedCardItem extends MediaItem {
  masterpieceLabels?: unknown;
  card: HTMLElement;
}

const installedRenderers = new WeakSet<object>();

function isMediaItem(value: unknown): value is MediaItem & { masterpieceLabels?: unknown } {
  return typeof value === "object"
    && value !== null
    && typeof Reflect.get(value, "filePath") === "string"
    && typeof Reflect.get(value, "title") === "string";
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
  adapters: LibraryAdapters,
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
  inputItems: Array<MediaItem & { masterpieceLabels?: unknown }>,
): GroupedCardItem[] {
  const byPath = new Map(inputItems.map((item) => [item.filePath, item]));
  const byIdentity = new Map<string, Array<MediaItem & { masterpieceLabels?: unknown }>>();
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

function renderGroupedCards(
  container: HTMLElement,
  inputItems: Array<MediaItem & { masterpieceLabels?: unknown }>,
  adapters: LibraryAdapters,
  state: LibraryState,
): void {
  if (normalizeSpecialLabelMode((Reflect.get(adapters, "plugin") as MasterpiecePlugin | undefined)?.settings?.specialLabelMode) !== "masterpiece") return;
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
    const section = document.createElement("section");
    section.className = "al-masterpiece-group";
    section.dataset.groupKey = group.key;

    const heading = document.createElement("div");
    heading.className = "al-masterpiece-group-heading";
    const title = document.createElement("h2");
    title.className = "al-masterpiece-group-title";
    title.textContent = group.label;
    const count = document.createElement("span");
    count.className = "al-masterpiece-group-count";
    count.textContent = String(group.items.length);
    heading.append(title, count);

    const grid = document.createElement("div");
    grid.className = `al-grid is-${state.view ?? "grid"} al-masterpiece-group-grid`;
    group.items.forEach((entry) => {
      let card = entry.card;
      if (usedPaths.has(entry.filePath)) {
        card = entry.card.cloneNode(true) as HTMLElement;
        bindClonedCard(card, entry, adapters);
      } else {
        usedPaths.add(entry.filePath);
      }
      grid.appendChild(card);
    });

    section.append(heading, grid);
    root.appendChild(section);
  }
}

export function installMasterpieceGroupedView(plugin: AnimeListPlugin): void {
  if (installedRenderers.has(AnimeListUI)) return;
  installedRenderers.add(AnimeListUI);
  const original = AnimeListUI.renderLibrary.bind(AnimeListUI);
  const host = plugin as MasterpiecePlugin;

  AnimeListUI.renderLibrary = (container, rawItems, rawAdapters = {}): void => {
    const adapters = rawAdapters as LibraryAdapters;
    const inputItems = rawItems.filter(isMediaItem);
    const upstreamStateChange = adapters.onStateChange;
    let renderVersion = 0;
    const forwardedAdapters: LibraryAdapters = {
      ...adapters,
      plugin: host,
      onStateChange: (state) => {
        upstreamStateChange?.(state);
        const version = ++renderVersion;
        queueMicrotask(() => {
          if (version !== renderVersion) return;
          renderGroupedCards(container, inputItems, forwardedAdapters, state);
        });
      },
    };
    original(container, rawItems, forwardedAdapters);
  };
}

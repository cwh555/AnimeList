import { normalizeImageSectionColumns } from "../domain/image-section-layout";
import {
  filterImageGalleryWorks,
  flattenImageGalleryImages,
  imageGalleryBoardPreview,
  imageGallerySessionImages,
  type ImageGalleryImage,
  type ImageGalleryMediaFilter,
  type ImageGalleryWork,
} from "../domain/image-gallery";
import type { ResolvedImageSectionAsset } from "../data/image-section-service";
import { imageGalleryText } from "../features/image-gallery/text";
import { uiText } from "../ui-text";
import { makeEl, setAnimeListIcon } from "./ui-helpers";
import { animateLayoutChange, transitionSurface } from "./layout-motion";

export interface ImageGalleryUiState {
  mode: "all" | "works";
  type: ImageGalleryMediaFilter;
  query: string;
  columns: number;
  workPath: string | null;
  sessionIndex: number | null;
}

export interface ImageGalleryUiAdapters {
  resolve(image: ImageGalleryImage): ResolvedImageSectionAsset;
  openLightbox(images: readonly ImageGalleryImage[], startIndex: number): void;
  openSource(path: string): void | Promise<void>;
  onStateChange?(state: ImageGalleryUiState): void;
}

export const DEFAULT_IMAGE_GALLERY_STATE: ImageGalleryUiState = {
  mode: "all",
  type: "all",
  query: "",
  columns: 4,
  workPath: null,
  sessionIndex: null,
};

const activeObservers = new WeakMap<HTMLElement, IntersectionObserver>();
const GALLERY_BATCH_SIZE = 80;

function typeLabel(type: ImageGalleryMediaFilter): string {
  const labels = {
    all: uiText("media.type.all"),
    anime: uiText("media.type.anime"),
    manga: uiText("media.type.manga"),
    novel: uiText("media.type.novel"),
  } satisfies Record<ImageGalleryMediaFilter, string>;
  return labels[type];
}

function workSummary(work: ImageGalleryWork): string {
  return imageGalleryText("workSummary", { images: work.images.length, sessions: work.sessions.length });
}

function createImageTile(
  image: ImageGalleryImage,
  allImages: readonly ImageGalleryImage[],
  adapters: ImageGalleryUiAdapters,
): HTMLElement {
  const tile = makeEl("article", "al-gallery-image-tile");
  tile.dataset.galleryKey = image.key;
  const open = makeEl("button", "al-gallery-image-open");
  open.type = "button";
  open.title = image.mediaTitle;
  open.setAttribute("aria-label", image.mediaTitle);
  const resolved = adapters.resolve(image);
  if (resolved.resourcePath) {
    const element = makeEl("img", "al-gallery-image");
    element.src = resolved.thumbnailSources?.src || resolved.resourcePath;
    if (resolved.thumbnailSources?.srcset) {
      element.srcset = resolved.thumbnailSources.srcset;
      element.sizes = "(max-width: 700px) 50vw, 25vw";
    }
    element.alt = image.mediaTitle;
    element.loading = "lazy";
    element.decoding = "async";
    element.draggable = false;
    open.appendChild(element);
  } else {
    const missing = makeEl("div", "al-gallery-image-missing");
    setAnimeListIcon(missing, "image-off");
    open.appendChild(missing);
  }
  open.addEventListener("click", () => {
    const index = allImages.findIndex((candidate) => candidate.key === image.key);
    adapters.openLightbox(allImages, Math.max(0, index));
  });

  const overlay = makeEl("div", "al-gallery-image-overlay");
  overlay.appendChild(makeEl("span", "al-gallery-image-work", image.mediaTitle));
  const source = makeEl("button", "al-gallery-source-button");
  source.type = "button";
  source.title = imageGalleryText("openSource");
  source.setAttribute("aria-label", source.title);
  setAnimeListIcon(source, "external-link");
  source.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void adapters.openSource(image.sourcePath);
  });
  overlay.appendChild(source);
  tile.append(open, overlay);
  return tile;
}

function renderProgressiveMasonry(
  container: HTMLElement,
  images: readonly ImageGalleryImage[],
  columnsValue: number,
  adapters: ImageGalleryUiAdapters,
): void {
  activeObservers.get(container)?.disconnect();
  activeObservers.delete(container);
  const columns = normalizeImageSectionColumns(columnsValue);
  const masonry = makeEl("div", "al-gallery-masonry");
  masonry.style.setProperty("--al-gallery-columns", String(columns));
  const columnElements = Array.from(
    { length: columns },
    () => makeEl("div", "al-gallery-masonry-column"),
  );
  masonry.append(...columnElements);
  container.appendChild(masonry);

  let rendered = 0;
  const appendBatch = (): void => {
    const end = Math.min(images.length, rendered + GALLERY_BATCH_SIZE);
    for (let index = rendered; index < end; index += 1) {
      const tile = createImageTile(images[index], images, adapters);
      tile.dataset.galleryIndex = String(index);
      columnElements[index % columns].appendChild(tile);
    }
    rendered = end;
  };
  appendBatch();
  if (rendered >= images.length) return;

  const sentinel = makeEl("div", "al-gallery-progressive-sentinel");
  sentinel.setAttribute("aria-hidden", "true");
  container.appendChild(sentinel);
  if (typeof IntersectionObserver !== "function") {
    while (rendered < images.length) appendBatch();
    sentinel.remove();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    appendBatch();
    if (rendered >= images.length) {
      observer.disconnect();
      activeObservers.delete(container);
      sentinel.remove();
    }
  }, { rootMargin: "500px 0px" });
  activeObservers.set(container, observer);
  observer.observe(sentinel);
}

function relayoutExistingMasonry(container: HTMLElement, columnsValue: number): boolean {
  const masonry = container.querySelector<HTMLElement>(".al-gallery-masonry");
  if (!masonry) return false;
  const columns = normalizeImageSectionColumns(columnsValue);
  const tiles = Array.from(masonry.querySelectorAll<HTMLElement>(".al-gallery-image-tile"))
    .sort((left, right) => Number(left.dataset.galleryIndex ?? 0) - Number(right.dataset.galleryIndex ?? 0));
  const columnElements = Array.from({ length: columns }, () => makeEl("div", "al-gallery-masonry-column"));
  void animateLayoutChange(tiles, () => {
    masonry.style.setProperty("--al-gallery-columns", String(columns));
    masonry.replaceChildren(...columnElements);
    tiles.forEach((tile, index) => columnElements[index % columns].appendChild(tile));
  });
  return true;
}

function renderWorkBoard(
  container: HTMLElement,
  works: readonly ImageGalleryWork[],
  adapters: ImageGalleryUiAdapters,
  onOpen: (work: ImageGalleryWork) => void,
): void {
  const board = makeEl("div", "al-gallery-work-board");
  for (const work of works) {
    const card = makeEl("button", "al-gallery-work-card");
    card.type = "button";
    card.addEventListener("click", () => onOpen(work));
    const mosaic = makeEl("div", "al-gallery-work-mosaic");
    const preview = imageGalleryBoardPreview(work, 4);
    for (const image of preview) {
      const cell = makeEl("div", "al-gallery-work-mosaic-cell");
      const resolved = adapters.resolve(image);
      if (resolved.resourcePath) {
        const img = makeEl("img");
        img.src = resolved.thumbnailSources?.src || resolved.resourcePath;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.draggable = false;
        cell.appendChild(img);
      } else {
        setAnimeListIcon(cell, "image-off");
      }
      mosaic.appendChild(cell);
    }
    while (mosaic.childElementCount < 4) mosaic.appendChild(makeEl("div", "al-gallery-work-mosaic-cell is-empty"));
    const copy = makeEl("div", "al-gallery-work-copy");
    copy.append(
      makeEl("strong", "al-gallery-work-title", work.title),
      makeEl("span", "al-gallery-work-meta", workSummary(work)),
    );
    card.append(mosaic, copy);
    board.appendChild(card);
  }
  container.appendChild(board);
}

function renderEmpty(container: HTMLElement): void {
  const empty = makeEl("div", "al-gallery-empty");
  const icon = makeEl("span", "al-gallery-empty-icon");
  setAnimeListIcon(icon, "images");
  empty.append(
    icon,
    makeEl("strong", "", imageGalleryText("emptyTitle")),
    makeEl("span", "", imageGalleryText("emptyDescription")),
  );
  container.appendChild(empty);
}

export function renderImageGallery(
  container: HTMLElement,
  works: readonly ImageGalleryWork[],
  initialState: ImageGalleryUiState,
  adapters: ImageGalleryUiAdapters,
): void {
  activeObservers.get(container)?.disconnect();
  container.replaceChildren();
  const state: ImageGalleryUiState = {
    ...DEFAULT_IMAGE_GALLERY_STATE,
    ...initialState,
    columns: normalizeImageSectionColumns(initialState.columns),
  };

  const root = makeEl("section", "al-image-gallery-page");
  const header = makeEl("header", "al-gallery-page-header");
  const copy = makeEl("div", "al-gallery-page-copy");
  copy.appendChild(makeEl("h1", "al-gallery-page-title", imageGalleryText("title")));
  const summary = makeEl("div", "al-gallery-page-summary");
  header.append(copy, summary);

  const modeTabs = makeEl("nav", "al-gallery-mode-tabs");
  modeTabs.setAttribute("aria-label", imageGalleryText("title"));
  const allMode = makeEl("button", "al-gallery-mode-tab");
  const allModeIcon = makeEl("span", "al-gallery-mode-icon");
  setAnimeListIcon(allModeIcon, "images");
  allMode.append(allModeIcon, makeEl("span", "", imageGalleryText("allImages")));
  const worksMode = makeEl("button", "al-gallery-mode-tab");
  const worksModeIcon = makeEl("span", "al-gallery-mode-icon");
  setAnimeListIcon(worksModeIcon, "layout-grid");
  worksMode.append(worksModeIcon, makeEl("span", "", imageGalleryText("byWork")));
  allMode.type = worksMode.type = "button";
  modeTabs.append(allMode, worksMode);

  const filters = makeEl("div", "al-gallery-filters");
  const typeFilters = makeEl("div", "al-gallery-type-filters");
  const typeButtons = new Map<ImageGalleryMediaFilter, HTMLButtonElement>();
  (["all", "anime", "manga", "novel"] as const).forEach((type) => {
    const button = makeEl("button", "al-gallery-type-filter", typeLabel(type));
    button.type = "button";
    typeButtons.set(type, button);
    typeFilters.appendChild(button);
  });
  const search = makeEl("label", "al-gallery-search");
  const searchIcon = makeEl("span", "al-icon");
  setAnimeListIcon(searchIcon, "search");
  const searchInput = makeEl("input");
  searchInput.type = "search";
  searchInput.placeholder = imageGalleryText("searchPlaceholder");
  searchInput.value = state.query;
  search.append(searchIcon, searchInput);

  const columns = makeEl("label", "al-gallery-columns");
  const columnsLabel = makeEl("span", "", imageGalleryText("columns"));
  const columnsInput = makeEl("input");
  columnsInput.type = "range";
  columnsInput.min = "1";
  columnsInput.max = "6";
  columnsInput.step = "1";
  columnsInput.value = String(state.columns);
  const columnsOutput = makeEl("output", "", String(state.columns));
  columns.append(columnsLabel, columnsInput, columnsOutput);
  filters.append(typeFilters, search, columns);

  const content = makeEl("div", "al-gallery-content");
  root.append(header, modeTabs, filters, content);
  container.appendChild(root);

  const emit = (): void => adapters.onStateChange?.({ ...state });

  const refresh = (): void => {
    transitionSurface(content, () => content.replaceChildren());
    const filteredWorks = filterImageGalleryWorks(works, state.type, state.query);
    const filteredImages = flattenImageGalleryImages(filteredWorks);
    summary.textContent = imageGalleryText("summary", { images: filteredImages.length, works: filteredWorks.length });
    allMode.classList.toggle("is-active", state.mode === "all");
    worksMode.classList.toggle("is-active", state.mode === "works");
    typeButtons.forEach((button, type) => button.classList.toggle("is-active", state.type === type));
    columnsInput.value = String(state.columns);
    columnsOutput.value = String(state.columns);

    const selectedWork = state.mode === "works" && state.workPath
      ? works.find((work) => work.sourcePath === state.workPath) ?? null
      : null;
    root.classList.toggle("is-work-detail", selectedWork !== null);
    columns.hidden = state.mode === "works" && selectedWork === null;
    typeFilters.hidden = selectedWork !== null;
    search.hidden = selectedWork !== null;

    if (selectedWork) {
      const detailHead = makeEl("div", "al-gallery-work-detail-head");
      const back = makeEl("button", "al-gallery-back");
      back.type = "button";
      setAnimeListIcon(back, "arrow-left");
      back.appendChild(makeEl("span", "", imageGalleryText("backToWorks")));
      back.addEventListener("click", () => {
        state.workPath = null;
        state.sessionIndex = null;
        emit();
        refresh();
      });
      const detailCopy = makeEl("div", "al-gallery-work-detail-copy");
      detailCopy.append(
        makeEl("h2", "", selectedWork.title),
        makeEl("span", "", workSummary(selectedWork)),
      );
      const source = makeEl("button", "al-secondary-button");
      source.type = "button";
      setAnimeListIcon(source, "external-link");
      source.appendChild(makeEl("span", "", imageGalleryText("openSource")));
      source.addEventListener("click", () => { void adapters.openSource(selectedWork.sourcePath); });
      detailHead.append(back, detailCopy, source);
      content.appendChild(detailHead);

      const sessions = makeEl("div", "al-gallery-session-filters");
      const allSessions = makeEl("button", `al-gallery-session-filter${state.sessionIndex === null ? " is-active" : ""}`, imageGalleryText("allSessions"));
      allSessions.type = "button";
      allSessions.addEventListener("click", () => {
        state.sessionIndex = null;
        emit();
        refresh();
      });
      sessions.appendChild(allSessions);
      selectedWork.sessions.forEach((session) => {
        const button = makeEl("button", `al-gallery-session-filter${state.sessionIndex === session.index ? " is-active" : ""}`, imageGalleryText("session", { number: session.index + 1 }));
        button.type = "button";
        button.addEventListener("click", () => {
          state.sessionIndex = session.index;
          emit();
          refresh();
        });
        sessions.appendChild(button);
      });
      content.appendChild(sessions);
      const images = imageGallerySessionImages(selectedWork, state.sessionIndex);
      if (images.length) renderProgressiveMasonry(content, images, state.columns, adapters);
      else renderEmpty(content);
      return;
    }

    if (state.mode === "all") {
      if (filteredImages.length) renderProgressiveMasonry(content, filteredImages, state.columns, adapters);
      else renderEmpty(content);
      return;
    }

    if (!filteredWorks.length) {
      renderEmpty(content);
      return;
    }
    renderWorkBoard(content, filteredWorks, adapters, (work) => {
      state.workPath = work.sourcePath;
      state.sessionIndex = null;
      emit();
      refresh();
    });
  };

  allMode.addEventListener("click", () => {
    state.mode = "all";
    state.workPath = null;
    state.sessionIndex = null;
    emit();
    refresh();
  });
  worksMode.addEventListener("click", () => {
    state.mode = "works";
    state.workPath = null;
    state.sessionIndex = null;
    emit();
    refresh();
  });
  typeButtons.forEach((button, type) => button.addEventListener("click", () => {
    state.type = type;
    state.workPath = null;
    state.sessionIndex = null;
    emit();
    refresh();
  }));
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    state.workPath = null;
    state.sessionIndex = null;
    emit();
    refresh();
  });
  columnsInput.addEventListener("input", () => {
    state.columns = normalizeImageSectionColumns(columnsInput.value);
    columnsOutput.value = String(state.columns);
    emit();
    if (!relayoutExistingMasonry(content, state.columns)) refresh();
  });

  refresh();
}

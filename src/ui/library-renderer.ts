import type { MediaItem } from "../types";
import { normalizeGenres } from "../domain/media-metadata";
import { collectLibraryFilterOptions, libraryFilterCount, libraryItemMatchesFilters, normalizeLibraryFilters, reconcileLibraryFilters, type LibraryFilters } from "../domain/library-filters";
import { mediaStatusMatches, normalizeMediaStatus, normalizeStatusFilter } from "../media-status";
import { normalizeProgressValue, normalizeReleaseStatus, normalizeVolumeLog, progressDisplayValue, progressRatio } from "../novel-progress";
import { mediaFormatLabel, statusFilterOptions, uiText } from "../ui-text";
import type { LibraryMediaFilter, LibraryRenderAdapters, LibraryRenderer, LibraryViewMode } from "./library-contracts";
import { LIBRARY_CARD_BATCH_SIZE, ProgressiveRenderWindow, type LibraryRenderBatch } from "./library-progressive-render";
import { MEDIA_UI_LABELS, appendIconLabel, asArray, itemStatusLabel, makeEl, mediaReleaseStatusLabel, mediaUnitLabel, numeric, parseDateValue, setAnimeListIcon } from "./ui-helpers";

export function libraryCoverSizes(view: LibraryViewMode): string {
  if (view === "list") return "116px";
  if (view === "poster") return "(max-width: 440px) 50vw, 180px";
  return "(max-width: 780px) 50vw, (min-width: 1500px) 20vw, 240px";
}

export function libraryEagerCoverCount(view: LibraryViewMode): number {
  return view === "poster" ? 10 : view === "list" ? 4 : 6;
}

const activeProgressiveRenders = new WeakMap<HTMLElement, () => void>();

export const AnimeListUI: LibraryRenderer = (() => {
  const normalize = (item: MediaItem): MediaItem => ({
    ...item,
    status: normalizeMediaStatus(item.status),
    releaseStatus: normalizeReleaseStatus(item.releaseStatus),
    progress: normalizeProgressValue(item.progress),
    total: item.mediaType === "anime" ? normalizeProgressValue(item.total) : 0,
    score: item.score == null ? null : numeric(item.score, null),
    genres: normalizeGenres(item.genres),
    people: asArray(item.people).filter(Boolean),
    platforms: asArray(item.platforms).filter(Boolean),
    sourceUrls: asArray(item.sourceUrls).filter(Boolean),
    favorite: item.favorite === true,
    updated: numeric(item.updated),
    startedAt: String(item.startedAt || ""),
    completedAt: String(item.completedAt || ""),
    volumeLog: normalizeVolumeLog(item.volumeLog),
  });

  const ratio = (item: MediaItem): number | null => item.mediaType === "anime"
    ? progressRatio(item.progress, item.total, item.unit)
    : null;
  const hasProgress = (value: unknown): boolean => {
    if (value === "" || value == null) return false;
    if (typeof value === "number") return value > 0;
    if (typeof value === "string") return value !== "0";
    return false;
  };

  const progressText = (item: MediaItem): string => {
    const unit = mediaUnitLabel(item.unit);
    const current = progressDisplayValue(item.progress);
    const total = progressDisplayValue(item.total);
    if (item.mediaType === "anime" && hasProgress(item.total)) return `${current} / ${total} ${unit}`.trim();
    if (hasProgress(item.progress)) return uiText(
      item.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress",
      { progress: current, unit },
    ).trim();
    return uiText("library.notStarted");
  };

  const statusMatch = (item: MediaItem, filter: string, adapters: LibraryRenderAdapters): boolean => {
    const customMatch = adapters.matchesStatusFilter?.(item, filter);
    return typeof customMatch === "boolean"
      ? customMatch
      : mediaStatusMatches(item.status, normalizeStatusFilter(filter));
  };

  function renderLibrary(
    container: HTMLElement,
    inputItems: MediaItem[],
    adapters: LibraryRenderAdapters = {},
  ): void {
    activeProgressiveRenders.get(container)?.();
    activeProgressiveRenders.delete(container);
    container.replaceChildren();
    const items = inputItems.map(normalize);
    const filterOptions = collectLibraryFilterOptions(items);
    const initialState = adapters.initialState ?? {};
    const requestedView = initialState.view ?? adapters.initialView;
    const initialView: LibraryViewMode = requestedView === "list" || requestedView === "poster"
      ? requestedView
      : "grid";
    const initialType: LibraryMediaFilter = initialState.type === "anime"
      || initialState.type === "manga"
      || initialState.type === "novel"
      ? initialState.type
      : "all";
    const statusOptions = (type: LibraryMediaFilter): Array<[string, string]> => [
      ...statusFilterOptions(type),
      ...(adapters.extraStatusFilters?.(type) ?? []),
    ];
    const initialStatus = String(initialState.status ?? "");
    const initialStatusKeys = new Set(statusOptions(initialType).map(([key]) => key));
    const state: {
      type: LibraryMediaFilter;
      status: string;
      filters: LibraryFilters;
      query: string;
      sort: string;
      view: LibraryViewMode;
    } = {
      type: initialType,
      status: initialStatusKeys.has(initialStatus) ? initialStatus : normalizeStatusFilter(initialStatus),
      filters: reconcileLibraryFilters(
        normalizeLibraryFilters(initialState.filters, initialState.genre),
        filterOptions,
      ),
      query: initialState.query ?? "",
      sort: initialState.sort ?? "completed-desc",
      view: initialView,
    };
    const openFile = adapters.openFile ?? (() => {});
    const addItem = adapters.addItem || null;
    const editItem = adapters.editItem || null;
    const toggleFavorite = adapters.toggleFavorite || null;
    const openTimeline = adapters.openTimeline || null;
    const openFilterModal = adapters.openFilterModal || null;

    const shell = makeEl("section", "al-shell");
    container.appendChild(shell);

    const header = makeEl("header", "al-hero");
    const titleBlock = makeEl("div", "al-hero-copy");
    titleBlock.append(
      makeEl("div", "al-kicker", uiText("library.kicker")),
      makeEl("h1", "al-title", uiText("library.title")),
      makeEl("p", "al-desc", uiText("library.description")),
   );
    const headerRight = makeEl("div", "al-hero-right");
    const stats = makeEl("div", "al-stats");
    ([
      ["anime", MEDIA_UI_LABELS.type.anime],
      ["manga", MEDIA_UI_LABELS.type.manga],
      ["novel", MEDIA_UI_LABELS.type.novel],
    ] as const).forEach(([key, label]) => {
      const stat = makeEl("div", "al-stat");
      stat.append(makeEl("strong", "al-stat-number", items.filter((x) => x.mediaType === key).length), makeEl("span", "al-stat-label", label));
      stats.appendChild(stat);
    });
    headerRight.appendChild(stats);
    const headerActions = makeEl("div", "al-hero-actions");
    if (openTimeline) {
      const timelineButton = makeEl("button", "al-secondary-button");
      timelineButton.type = "button";
      appendIconLabel(timelineButton, "timeline", uiText("library.timeline"));
      timelineButton.addEventListener("click", () => { void openTimeline(); });
      headerActions.appendChild(timelineButton);
    }
    if (addItem) {
      const addButton = makeEl("button", "al-add-button");
      addButton.type = "button";
      appendIconLabel(addButton, "plus", uiText("action.collect"));
      addButton.addEventListener("click", () => addItem(state.type === "all" ? "anime" : state.type));
      headerActions.appendChild(addButton);
    }
    headerRight.appendChild(headerActions);
    header.append(titleBlock, headerRight);
    shell.appendChild(header);

    const nav = makeEl("nav", "al-type-tabs");
    const typeButtons = new Map<LibraryMediaFilter, HTMLButtonElement>();
    ([
      ["all", uiText("library.tabAll")],
      ["anime", MEDIA_UI_LABELS.type.anime],
      ["manga", MEDIA_UI_LABELS.type.manga],
      ["novel", MEDIA_UI_LABELS.type.novel],
    ] as const).forEach(([key, label]) => {
      const count = key === "all" ? items.length : items.filter((x) => x.mediaType === key).length;
      const button = makeEl("button", `al-type-tab${key === state.type ? " is-active" : ""}`);
      button.type = "button";
      button.append(makeEl("span", "", label), makeEl("span", "al-tab-count", count));
      button.addEventListener("click", () => {
        state.type = key;
        typeButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        renderStatusButtons();
        update();
      });
      typeButtons.set(key, button);
      nav.appendChild(button);
    });
    shell.appendChild(nav);

    const toolbar = makeEl("div", "al-toolbar");
    const searchWrap = makeEl("label", "al-search");
    const searchIcon = makeEl("span", "al-icon");
    setAnimeListIcon(searchIcon, "search");
    const searchInput = makeEl("input");
    searchInput.type = "search";
    searchInput.placeholder = uiText("library.searchPlaceholder");
    searchInput.value = state.query;
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim().toLocaleLowerCase();
      update();
    });
    searchWrap.append(searchIcon, searchInput);

    const filterButton = makeEl("button", "al-filter-button");
    filterButton.type = "button";
    const renderFilterButton = (): void => {
      filterButton.replaceChildren();
      appendIconLabel(filterButton, "filter", uiText("library.filterButton"));
      const count = libraryFilterCount(state.filters);
      if (count > 0) filterButton.appendChild(makeEl("span", "al-filter-count", count));
      filterButton.classList.toggle("is-active", count > 0);
    };
    renderFilterButton();
    if (openFilterModal) {
      filterButton.addEventListener("click", () => {
        openFilterModal(
          normalizeLibraryFilters(state.filters),
          filterOptions,
          (filters) => {
            state.filters = normalizeLibraryFilters(filters);
            renderFilterButton();
            update();
          },
        );
      });
    } else {
      filterButton.disabled = true;
    }

    const sortWrap = makeEl("label", "al-sort");
    const sortIcon = makeEl("span", "al-icon");
    setAnimeListIcon(sortIcon, "sort");
    const sortSelect = makeEl("select");
    ([
      ["completed-desc", uiText("library.sort.completedDesc")], ["completed-asc", uiText("library.sort.completedAsc")],
      ["updated-desc", uiText("library.sort.updatedDesc")], ["updated-asc", uiText("library.sort.updatedAsc")],
      ["score-desc", uiText("library.sort.scoreDesc")], ["score-asc", uiText("library.sort.scoreAsc")],
      ["started-desc", uiText("library.sort.startedDesc")], ["started-asc", uiText("library.sort.startedAsc")],
      ["year-desc", uiText("library.sort.yearDesc")], ["year-asc", uiText("library.sort.yearAsc")],
      ["progress-desc", uiText("library.sort.progressDesc")], ["title-asc", uiText("library.sort.titleAsc")],
    ] as Array<[string, string]>).forEach(([value, text]) => {
      const option = makeEl("option", "", text);
      option.value = value;
      option.selected = value === state.sort;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    sortWrap.append(sortIcon, sortSelect);

    const views = makeEl("div", "al-view-switch");
    const viewButtons = new Map<LibraryViewMode, HTMLButtonElement>();
    ([
      ["grid", "grid", uiText("library.view.grid")],
      ["list", "list", uiText("library.view.list")],
      ["poster", "poster", uiText("library.view.poster")],
    ] as Array<[LibraryViewMode, string, string]>).forEach(([key, icon, label]) => {
      const button = makeEl("button", `al-view-button${key === state.view ? " is-active" : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      setAnimeListIcon(button, icon);
      button.addEventListener("click", () => {
        state.view = key;
        adapters.onViewChange?.(key);
        viewButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        update();
      });
      viewButtons.set(key, button);
      views.appendChild(button);
    });
    toolbar.append(searchWrap, filterButton, sortWrap, views);
    shell.appendChild(toolbar);

    const statusBar = makeEl("div", "al-status-bar");
    const statusButtons = new Map<string, HTMLButtonElement>();
    const renderStatusButtons = (): void => {
      statusButtons.clear();
      statusBar.replaceChildren();
      statusOptions(state.type).forEach(([key, label]) => {
        const button = makeEl("button", `al-status-chip${key === state.status ? " is-active" : ""}`, label);
        button.type = "button";
        button.addEventListener("click", () => {
          state.status = key;
          statusButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
          update();
        });
        statusButtons.set(key, button);
        statusBar.appendChild(button);
      });
    };
    renderStatusButtons();
    shell.appendChild(statusBar);

    const resultHead = makeEl("div", "al-result-head");
    const resultTitle = makeEl("strong", "al-result-title");
    const resultMeta = makeEl("span", "al-result-meta");
    resultHead.append(resultTitle, resultMeta);
    shell.appendChild(resultHead);
    const grid = makeEl("div", "al-grid is-grid");
    shell.appendChild(grid);
    const cardCache = new Map<string, HTMLElement>();

    const makeCard = (item: MediaItem): HTMLElement => {
      const card = makeEl("article", `al-card status-${item.status}`);
      card.tabIndex = 0;
      card.dataset.path = item.filePath;
      card.setAttribute("role", "link");
      card.addEventListener("click", () => openFile(item.filePath));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openFile(item.filePath);
        }
      });

      const media = makeEl("div", "al-cover-wrap");
      if (item.cover) {
        const image = makeEl("img", "al-cover");
        const sources = item.coverSources;
        image.alt = uiText("library.coverAlt", { title: item.title });
        image.loading = "lazy";
        image.decoding = "async";
        image.fetchPriority = "auto";
        if (sources?.placeholder) {
          media.classList.add("has-cover-placeholder");
          media.style.backgroundImage = `url(${JSON.stringify(sources.placeholder)})`;
        }
        if (sources?.srcset) image.srcset = sources.srcset;
        image.src = sources?.src || item.cover;
        const reveal = (): void => image.classList.add("is-loaded");
        image.addEventListener("load", reveal, { once: true });
        image.addEventListener("error", () => {
          image.remove();
          media.classList.remove("has-cover-placeholder");
          media.style.removeProperty("background-image");
          const missing = makeEl("div", "al-cover-missing");
          const icon = makeEl("span", "al-icon-large");
          setAnimeListIcon(icon, "book");
          missing.append(icon, makeEl("span", "", uiText("library.coverMissing")));
          media.prepend(missing);
        }, { once: true });
        if (image.complete && image.naturalWidth > 0) reveal();
        media.appendChild(image);
      } else {
        const missing = makeEl("div", "al-cover-missing");
        const icon = makeEl("span", "al-icon-large");
        setAnimeListIcon(icon, "book");
        missing.append(icon, makeEl("span", "", uiText("library.coverMissing")));
        media.appendChild(missing);
      }
      media.appendChild(makeEl("div", "al-cover-shade"));
      const top = makeEl("div", "al-cover-top");
      const badges = makeEl("div", "al-cover-badges");
      badges.appendChild(makeEl("span", "al-format-badge", `${MEDIA_UI_LABELS.type[item.mediaType]} · ${item.year || "—"}`));
      if (item.score != null) badges.appendChild(makeEl("span", "al-score-badge", `★ ${item.score.toFixed(1)}`));
      top.appendChild(badges);
      const topActions = makeEl("div", "al-card-top-actions");
      if (toggleFavorite) {
        const favoriteButton = makeEl("button", `al-favorite-button${item.favorite ? " is-active" : ""}`, item.favorite ? "★" : "☆");
        favoriteButton.type = "button";
        favoriteButton.title = item.favorite ? uiText("library.favoriteRemove") : uiText("library.favoriteAdd");
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
        favoriteButton.setAttribute("aria-pressed", item.favorite ? "true" : "false");
        favoriteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          favoriteButton.disabled = true;
          void Promise.resolve(toggleFavorite(item.filePath, !item.favorite))
            .finally(() => { favoriteButton.disabled = false; });
        });
        topActions.appendChild(favoriteButton);
      }
      if (editItem) {
        const editButton = makeEl("button", "al-edit-button");
        editButton.type = "button";
        editButton.title = uiText("action.edit");
        editButton.setAttribute("aria-label", editButton.title);
        setAnimeListIcon(editButton, "edit");
        editButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          editItem(item.filePath);
        });
        topActions.appendChild(editButton);
      }
      top.appendChild(topActions);
      media.appendChild(top);
      const bottom = makeEl("div", "al-cover-bottom");
      const statusBadges = makeEl("span", "al-status-group");
      statusBadges.appendChild(makeEl("span", `al-status status-${item.status}`, itemStatusLabel(item)));
      bottom.append(statusBadges, makeEl("span", "al-progress-on-cover", progressText(item)));
      media.appendChild(bottom);

      const body = makeEl("div", "al-card-body");
      body.appendChild(makeEl("h2", "al-card-title", item.title));
      if (item.originalTitle) body.appendChild(makeEl("div", "al-original-title", item.originalTitle));
      const facts = makeEl("div", "al-facts");
      facts.appendChild(makeEl("span", "", mediaFormatLabel(item.format) || uiText("library.unknownFormat")));
      if (item.people.length) facts.appendChild(makeEl("span", "", item.people.slice(0, 2).join("、")));
      body.appendChild(facts);
      if (item.startedAt || item.completedAt) {
        const dates = makeEl("div", "al-date-row");
        if (item.startedAt) dates.appendChild(makeEl("span", "", uiText("library.startedAt", { date: item.startedAt })));
        if (item.completedAt) dates.appendChild(makeEl("span", "", uiText("library.completedAt", { date: item.completedAt })));
        body.appendChild(dates);
      }
      if (item.genres.length) {
        const tags = makeEl("div", "al-tags");
        item.genres.slice(0, 4).forEach((genre) => tags.appendChild(makeEl("span", "al-tag", genre)));
        body.appendChild(tags);
      }
      const progress = makeEl("div", "al-progress");
      const itemRatio = ratio(item);
      if (itemRatio !== null) {
        const bar = makeEl("div", "al-progress-track");
        const fill = makeEl("div", "al-progress-fill");
        fill.style.width = `${Math.round(itemRatio * 100)}%`;
        bar.appendChild(fill);
        progress.appendChild(bar);
      }
      const progressRow = makeEl("div", "al-progress-row");
      progressRow.appendChild(makeEl("span", "", progressText(item)));
      if (itemRatio !== null) progressRow.appendChild(makeEl("span", "", `${Math.round(itemRatio * 100)}%`));
      else if (item.mediaType !== "anime") progressRow.appendChild(makeEl("span", "al-release-label", mediaReleaseStatusLabel(item.releaseStatus)));
      progress.appendChild(progressRow);
      body.appendChild(progress);
      const footer = makeEl("div", "al-card-footer");
      footer.append(
        makeEl("span", "al-updated", item.updatedLabel || ""),
        makeEl("span", "al-score", item.score == null ? uiText("library.unrated") : `★ ${item.score.toFixed(1)}`),
      );
      body.appendChild(footer);
      card.append(media, body);
      return card;
    };

    const appendCard = (item: MediaItem, index: number, eagerCount: number): void => {
      let card = cardCache.get(item.filePath);
      if (!card) {
        card = makeCard(item);
        cardCache.set(item.filePath, card);
      }
      const image = card.querySelector<HTMLImageElement>("img.al-cover");
      if (image) {
        image.loading = index < eagerCount ? "eager" : "lazy";
        image.fetchPriority = index < 2 ? "high" : "auto";
        image.sizes = libraryCoverSizes(state.view);
      }
      grid.appendChild(card);
    };

    function update(): void {
      activeProgressiveRenders.get(container)?.();
      activeProgressiveRenders.delete(container);
      const query = state.query;
      let filtered = items.filter((item) => {
        if (state.type !== "all" && item.mediaType !== state.type) return false;
        if (!statusMatch(item, state.status, adapters)) return false;
        if (!libraryItemMatchesFilters(item, state.filters)) return false;
        if (!query) return true;
        return [item.title, item.originalTitle, item.format, ...item.genres, ...item.people, ...item.platforms].join(" ").toLocaleLowerCase().includes(query);
      });
      const missingLast = (value: number, direction: number): number => value ? value : direction > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
      const sorters: Record<string, (left: MediaItem, right: MediaItem) => number> = {
        "updated-desc": (a, b) => b.updated - a.updated,
        "updated-asc": (a, b) => a.updated - b.updated,
        "score-desc": (a, b) => (b.score ?? -1) - (a.score ?? -1),
        "score-asc": (a, b) => (a.score ?? Number.MAX_SAFE_INTEGER) - (b.score ?? Number.MAX_SAFE_INTEGER),
        "started-desc": (a, b) => missingLast(parseDateValue(b.startedAt), -1) - missingLast(parseDateValue(a.startedAt), -1),
        "started-asc": (a, b) => missingLast(parseDateValue(a.startedAt), 1) - missingLast(parseDateValue(b.startedAt), 1),
        "completed-desc": (a, b) => missingLast(parseDateValue(b.completedAt), -1) - missingLast(parseDateValue(a.completedAt), -1),
        "completed-asc": (a, b) => missingLast(parseDateValue(a.completedAt), 1) - missingLast(parseDateValue(b.completedAt), 1),
        "year-desc": (a, b) => numeric(b.year) - numeric(a.year),
        "year-asc": (a, b) => numeric(a.year) - numeric(b.year),
        "title-asc": (a, b) => a.title.localeCompare(b.title, "zh-Hant"),
        "progress-desc": (a, b) => (ratio(b) ?? -1) - (ratio(a) ?? -1),
      };
      filtered.sort(sorters[state.sort] || sorters["completed-desc"]);
      resultTitle.textContent = state.type === "all" ? uiText("library.resultAll") : MEDIA_UI_LABELS.type[state.type];
      const activeFilterCount = libraryFilterCount(state.filters);
      const filterSuffix = activeFilterCount ? ` · ${uiText("library.filterActiveCount", { count: activeFilterCount })}` : "";
      resultMeta.textContent = uiText("library.resultMeta", { shown: filtered.length, total: items.length, genre: filterSuffix });
      grid.className = `al-grid is-${state.view}`;
      grid.replaceChildren();
      if (!filtered.length) {
        const empty = makeEl("div", "al-empty");
        const icon = makeEl("span", "al-empty-icon");
        setAnimeListIcon(icon, "book");
        empty.append(icon, makeEl("strong", "", uiText("library.emptyTitle")), makeEl("span", "", uiText("library.emptyDescription")));
        grid.appendChild(empty);
        adapters.afterRender?.({ ...state });
        return;
      }
      const renderState = { ...state };
      const eagerCount = libraryEagerCoverCount(state.view);
      const requiresCompleteDom = adapters.requiresCompleteDom?.(renderState) === true;
      const renderWindow = new ProgressiveRenderWindow(
        filtered.length,
        requiresCompleteDom ? filtered.length : LIBRARY_CARD_BATCH_SIZE,
      );
      const appendBatch = (batch: LibraryRenderBatch): void => {
        for (let index = batch.start; index < batch.end; index += 1) {
          appendCard(filtered[index], index, eagerCount);
        }
        adapters.afterRender?.({ ...state });
      };
      const initialBatch = renderWindow.reset();
      appendBatch(initialBatch);
      if (adapters.onStateChange) adapters.onStateChange({ ...state });
      if (initialBatch.done) return;

      const sentinel = makeEl("div", "al-library-progressive-sentinel", "\u200b");
      sentinel.setAttribute("aria-hidden", "true");
      let observer: IntersectionObserver | null = null;
      let idleHandle: number | null = null;
      let timerHandle: number | null = null;
      let cancelled = false;

      const cancel = (): void => {
        if (cancelled) return;
        cancelled = true;
        observer?.disconnect();
        if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        }
        if (timerHandle !== null) window.clearTimeout(timerHandle);
        sentinel.remove();
      };
      activeProgressiveRenders.set(container, cancel);

      const revealNext = (): void => {
        if (cancelled) return;
        sentinel.remove();
        const batch = renderWindow.next();
        appendBatch(batch);
        if (batch.done) {
          observer?.disconnect();
          activeProgressiveRenders.delete(container);
          return;
        }
        grid.after(sentinel);
        observer?.observe(sentinel);
      };

      grid.after(sentinel);
      if (typeof IntersectionObserver === "function") {
        observer = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.unobserve(sentinel);
          revealNext();
        }, { rootMargin: "800px 0px" });
        observer.observe(sentinel);
      } else {
        const scheduleIdleBatch = (): void => {
          if (cancelled) return;
          const run = (): void => {
            idleHandle = null;
            timerHandle = null;
            revealNext();
            if (!cancelled && sentinel.isConnected) scheduleIdleBatch();
          };
          if (typeof window.requestIdleCallback === "function") {
            idleHandle = window.requestIdleCallback(run, { timeout: 250 });
          } else {
            timerHandle = window.setTimeout(run, 16);
          }
        };
        scheduleIdleBatch();
      }
    }

    update();
  }

  return { renderLibrary };
})();


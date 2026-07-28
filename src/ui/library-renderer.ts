import type { MediaItem } from "../types";
import { normalizeGenres } from "../domain/media-metadata";
import { mediaStatusMatches, normalizeMediaStatus, normalizeStatusFilter } from "../media-status";
import { normalizeProgressValue, normalizeReleaseStatus, normalizeVolumeLog, progressDisplayValue, progressRatio } from "../novel-progress";
import { mediaFormatLabel, statusFilterOptions, uiText } from "../ui-text";
import type { LibraryMediaFilter, LibraryRenderAdapters, LibraryRenderer, LibraryRenderState, LibraryViewMode } from "./library-contracts";
import { MEDIA_UI_LABELS, appendIconLabel, asArray, itemStatusLabel, makeEl, mediaReleaseStatusLabel, mediaUnitLabel, numeric, parseDateValue, setAnimeListIcon } from "./ui-helpers";

export const AnimeListUI: LibraryRenderer = (() => {
  const normalize = (item: MediaItem): MediaItem => ({
    ...item,
    status: normalizeMediaStatus(item.status),
    releaseStatus: normalizeReleaseStatus(item.releaseStatus),
    progress: normalizeProgressValue(item.progress),
    total: item.mediaType === "anime" ? normalizeProgressValue(item.total) : 0,
    score: item.score == null ? null : numeric(item.score, null),
    genres: normalizeGenres(item.genres),
    people: asArray(item.people).filter(Bolean),
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
    container.replaceChildren();
    const items = inputItems.map(normalize);
    const genres = [...new Set(items.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
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
    const statusOptions = (type: LibraryMediaFilter): Array<[string, string> => [
      ...statusFilterOptions(type),
      ...(adapters.extraStatusFilters?.(type) ?? []),
    ];
    const initialStatus = String(initialState.status ?? "");
    const initialStatusKeys = new Set(statusOptions(initialType).map(([key]) => key));
    const state: Required<LibraryRenderState> = {
      type: initialType,
      status: initialStatusKeys.has(initialStatus) ? initialStatus : normalizeStatusFilter(initialStatus),
      genre: initialState.genre ?? "all",
      query: initialState.query ?? "",
      sort: initialState.sort ?? "completed-desc",
      view: initialView,
    };
    const openFile = adapters.openFile ?? (() => {});
    const addItem = adapters.addItem || null;
    const editItem = adapters.editItem || null;
    const toggleFavorite = adapters.toggleFavorite || null;
    const openTimeline = adapters.openTimeline || null;

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
    searchInput.addEventListener("input", () => { state.query = searchInput.value.trim().toLocaleLowerCase();
      update(); });
    searchWrap.append(searchIcon, searchInput);
    const genreWrap = makeEl("label", "al-filter");
    const genreSelect = makeEl("select");
    genreSelect.append(...[["all", uiText("library.allGenres")], ...genres.map((genre) => [genre, genre] as [string, string])].map(([value, text]) => {
      const option = makeEl("option");
      option.value = value;
      option.textContent = text;
      return option;
    }));
    genreSelect.value = state.genre;
    genreSelect.addEventListener("change", () => { state.genre = genreSelect.value; update(); });
    genreWrap.append(makeEl("span", "", uiText("library.genre")), genreSelect);

    const sortWrap = makeEl("label", "al-filter");
    const sortSelect = makeEl("select");
    [
      ["completed-desc", uiText("sort.completedDesc")], ["completed-asc", uiText("sort.completedAsc")],
      ["updated-desc", uiText("sort.updatedDesc")], ["updated-asc", uiText("sort.updatedAsc")],
      ["score-desc", uiText("sort.scoreDesc")], ["score-asc", uiText("sort.scoreAsc")],
      ["started-desc", uiText("sort.startedDesc")], ["started-asc", uiText("sort.startedAsc")],
      ["year-desc", uiText("sort.yearDesc")], ["year-asc", uiText("sort.yearAsc")],
      ["title-asc", uiText("sort.titleAsc")], ["progress-desc", uiText("sort.progressDesc")],
    ].forEach(([value, text]) => {
      const option = makeEl("option");
      option.value = value;
      option.textContent = text;
      sortSelect.appendChild(option);
    });
    sortSelect.value = state.sort;
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    sortWrap.append(makeEl("span", "", uiText("library.sort")), sortSelect);

    const viewTrigger = makeEl("button", "al-view-trigger");
    viewTrigger.type = "button";
    viewTrigger.setAttribute("aria-label", uiText("library.viewOptions"));
    viewTrigger.title = uiText("library.viewOptions");
    const viewMenu = makeEl("div", "al-view-menu");
    viewMenu.hidden = true;
    const viewWrap = makeEl("div", "al-view-popover");
    viewWrap.append(viewTrigger, viewMenu);
    const viewButtons = new Map<LibraryViewMode, HTMLButtonElement>();
    const syncViewButtons = (): void => {
      for (const [name, button] of viewButtons) button.classList.toggle("is-active", name === state.view);
      setAnimeListIcon(viewTrigger, state.view === "grid" ? "grid" : state.view === "list" ? "list" : "poster");
    };
    for (const [value, icon, label] of [
      ["grid", "grid", uiText("library.viewGrid")],
      ["list", "list", uiText("library.viewList")],
      ["poster", "poster", uiText("library.viewPoster")],
    ] as Array<[LibraryViewMode, string, string]>) {
      const button = makeEl("button", "al-view-option");
      button.type = "button";
      button.appendChild(makeEl("span", "al-view-option-icon"));
      setAnimeListIcon(button.firstElementChild as HTMLElement, icon);
      button.appendChild(makeEl("span", "", label));
      button.addEventListener("click", () => {
        state.view = value;
        syncViewButtons();
        viewMenu.hidden = true;
        adapters.onViewChange?.(value);
        update();
      });
      viewButtons.set(value, button);
      viewMenu.appendChild(button);
    }
    syncViewButtons();
    viewTrigger.addEventListener("click", () => {
      viewMenu.hidden = !viewMenu.hidden;
    });

    toolbar.append(searchWrap, genreWrap, sortWrap, viewWrap);
    shell.appendChild(toolbar);

    const statusToolbar = makeEl("div", "al-status-toolbar");
    shell.appendChild(statusToolbar);
    let statusButtons = new Map<string, HTMLButtonElement>();
    function renderStatusButtons(): void {
      statusToolbar.replaceChildren();
      statusButtons = new Map();
      for (const [key, label] of statusOptions(state.type)) {
        const button = makeEl("button", `al-status-chip${key === state.status ? " is-active" : ""}`, label);
        button.type = "button";
        button.addEventListener("click", () => {
          state.status = key;
          statusButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
          update();
        });
        statusButtons.set(key, button);
        statusToolbar.appendChild(button);
      }
    }
    renderStatusButtons();

    const resultHeader = makeEl("div", "al-result-header");
    const resultTitle = makeEl("strong");
    const resultMeta = makeEl("span");
    resultHeader.append(resultTitle, resultMeta);
    shell.appendChild(resultHeader);
    const grid = makeEl("div", "al-grid");
    shell.appendChild(grid);

    const coverSizes = (view: LibraryViewMode): string => view === "list"
      ? "(max-width: 720px) 112px, (max-width: 1150px) 156px, 190px"
      : view === "poster"
        ? "(max-width: 720px) 50pvw, (max-width: 1150px) 33vw, 240px"
        : "(max-width: 720px) 50vw, (max-width: 1150px) 33vw, 260px";
    const eagerCoverCount = (view: LibraryViewMode): number => view === "list" ? 10 : view === "poster" ? 6 : 8;
    const cardCache = new Map<string, HTMLElement>();

    const makeCard = (item: MediaItem): HTMLElement => {
      const card = makeEl("article", `al-card status-${item.status}`);
      card.tabIndex = 0;
      card.dataset.path = item.filePath;
      card.addEventListener("click", () => openFile(item.filePath));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openFile(item.filePath);
        }
      });

      const media = makeEl("div", "al-card-media");
      if (item.cover) {
        const image = makeEl("img", "al-cover");
        image.src = item.cover;
        image.alt = uiText("library.coverAlt", { title: item.title });
        image.loading = "lazy";
        image.decoding = "async";
        image.sizes = coverSizes(state.view);
        if (item.coverSources?.srcset) image.srcset = item.coverSources.srcset;
        image.addEventListener("error", () => {
          image.remove();
          if (!media.querySelector(".al-cover-placeholder")) media.prepend(makeEl("div", "al-cover-placeholder", item.title.charAt(0)));
        }, { once: true });
        media.appendChild(image);
      } else {
        media.appendChild(makeEl("div", "al-cover-placeholder", item.title.charAt(0)));
      }
      const top = makeEl("div", "al-cover-top");
      if (item.score != null) top.appendChild(makeEl("span", "al-cover-score", `{item.scor.toFixed(1)}`));
      const topActions = makeEl("div", "al-cover-actions");
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
        editButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); editItem(item.filePath); });
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
      facts.appendChild(makeEl("span", "", mediaFormatlabel(item.format) || uiText("library.unknownFormat"));
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
      footer.append(makeEl("span", "al-updated", item.updatedLabel || ""), makeEl("span", "al-score", item.score == null ? uiText("library.unrated") : `★ ${item.score.toFixed(1)}`));
      body.appendChild(footer);
      card.append(media, body);
      return card;
    };

    function update(): void {
      const query = state.query;
      let filtered = items.filter((item) => {
        if (state.type !== "all" && item.mediaType !== state.type) return false;
        if (!statusMatch(item, state.status, adapters)) return false;
        if (state.genre !== "all" && !item.genres.includes(state.genre)) return false;
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
      const genreSuffix = state.genre === "all" ? "" : ` · ${state.genre}`;
      resultMeta.textContent = uiText("library.resultMeta", { shown: filtered.length, total: items.length, genre: genreSuffix });
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
      const eagerCount = eagerCoverCount(state.view);
      filtered.forEach((item, index) => {
        let card = cardCache.get(item.filePath);
        if (!card) {
          card = makeCard(item);
          cardCache.set(item.filePath, card);
        }
        const image = card.querySelector<HTMLImageElement>("img.al-cover");
        if (image) {
          image.loading = index < eagerCount ? "eager" : "lazy";
          image.fetchPriority = index < 2 ? "high" : "auto";
          image.sizes = coverSizes(state.view);
        }
        grid.appendChild(card);
      });
      if (adapters.onStateChange) adapters.onStateChange({ ...state });
      adapters.afterRender?.({ ...state });
    }

    update();
  }

  return { renderLibrary };
})();


/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- Legacy compatibility layer consumes runtime-validated provider data while preserving the tested v6.2 behavior. */
// @ts-nocheck
import { MarkdownRenderChild, Modal, Notice, Plugin, requestUrl, normalizePath, setIcon } from "obsidian";
import { getScopedMarkdownFiles } from "./vault-scope";
import { USER_AGENT } from "./app-metadata";
import {
  completedRequirementMessage,
  completedStatusLabel,
  mediaFormatLabel,
  mediaProviderLabel,
  mediaStatusLabel,
  mediaStatusOptions,
  statusFilterOptions,
  uiText,
} from "./ui-text";
import { mediaStatusMatches, normalizeMediaStatus, normalizeStatusFilter } from "./media-status";
import { CURRENT_MEDIA_SCHEMA_VERSION } from "./schema-migration";
import {
  compareVolumeLabels,
  expandTimelineEntries,
  highestCompletedVolume,
  normalizeProgressValue,
  normalizeReleaseStatus,
  normalizeVolumeLabel,
  normalizeVolumeLog,
  progressDisplayValue,
  progressRatio,
  serializeVolumeLog,
} from "./novel-progress";
import {
  MAX_TIMELINE_DAY_SPACING,
  MAX_TIMELINE_VIEW_SCALE,
  MIN_TIMELINE_DAY_SPACING,
  MIN_TIMELINE_VIEW_SCALE,
  calculateDefaultTimelineView,
  normalizeTimelineMaxStackDepth,
  preserveTimelineAxisScreenY,
} from "./timeline-scale";
import { centerLatestTimelineAxis } from "./timeline-corrections";
import { MediaRepository } from "./data/media-repository";
import { markMediaFormField } from "./ui/media-form-field";
import {
  dedupeSearchResults,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeOpenLibraryBook,
} from "./data/provider-normalizers";
import {
  applyTemplateVariables,
  buildMediaMarkdown,
  completedProgress,
  ensureDetailBlock,
} from "./data/media-note-codec";
import { normalizeGenres } from "./domain/media-metadata";
import {
  formatFileModifiedTime,
  sanitizePathPart,
  slugify,
} from "./domain/value-normalization";

const MEDIA_ROOT = "Media";
const COVER_ROOT = "Assets/Covers";
const TEMPLATE_ROOT = "Templates";

const LABEL = {
  type: {
    get all() { return uiText("media.type.all"); },
    get anime() { return uiText("media.type.anime"); },
    get manga() { return uiText("media.type.manga"); },
    get novel() { return uiText("media.type.novel"); },
  },
  unit: {
    get episode() { return uiText("media.unit.episode"); },
    get chapter() { return uiText("media.unit.chapter"); },
    get volume() { return uiText("media.unit.volume"); },
    get page() { return uiText("media.unit.page"); },
    get percent() { return uiText("media.unit.percent"); },
  },
  releaseStatus: {
    get releasing() { return uiText("media.release.releasing"); },
    get finished() { return uiText("media.release.finished"); },
    get hiatus() { return uiText("media.release.hiatus"); },
    get cancelled() { return uiText("media.release.cancelled"); },
    get unknown() { return uiText("media.release.unknown"); },
  },
};

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function numeric(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateValue(value) {
  if (!value) return 0;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const timelineTitleCollator = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });

function compareTimelineEntries(left, right) {
  const leftSeries = String(left?.seriesTitle || left?.title || "");
  const rightSeries = String(right?.seriesTitle || right?.title || "");
  const seriesOrder = timelineTitleCollator.compare(leftSeries, rightSeries);
  if (seriesOrder) return seriesOrder;
  const leftVolume = normalizeVolumeLabel(left?.volumeLabel);
  const rightVolume = normalizeVolumeLabel(right?.volumeLabel);
  if (leftVolume && rightVolume) {
    const volumeOrder = compareVolumeLabels(leftVolume, rightVolume);
    if (volumeOrder) return volumeOrder;
  } else if (leftVolume) return 1;
  else if (rightVolume) return -1;
  return timelineTitleCollator.compare(String(left?.title || ""), String(right?.title || ""));
}

function parseConfig(source) {
  const config = { source: MEDIA_ROOT };
  for (const line of String(source || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return config;
}

function itemStatusLabel(item) {
  return mediaStatusLabel(item.status, item.mediaType);
}

function makeEl(tag, className, text) {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setAnimeListIcon(element, name) {
  const iconIds = {
    search: "search",
    grid: "layout-grid",
    list: "list",
    poster: "image",
    sort: "list-filter",
    book: "book-open",
    plus: "plus",
    edit: "pencil",
    timeline: "git-branch",
    trash: "trash-2",
    external: "external-link",
    minus: "minus",
    fit: "maximize-2",
  };
  setIcon(element, iconIds[name] || name);
  return element;
}

function appendIconLabel(element, icon, label) {
  setAnimeListIcon(element, icon);
  element.appendChild(makeEl("span", "", label));
  return element;
}

export const AnimeListUI = (() => {
  const normalize = (item) => {
    const mediaType = String(item.mediaType || item.media_type || "").toLowerCase();
    return {
    ...item,
    mediaType,
    status: normalizeMediaStatus(item.status),
    format: String(item.format || item.mediaType || item.media_type || "").toLowerCase(),
    releaseStatus: normalizeReleaseStatus(item.releaseStatus || item.release_status),
    progress: normalizeProgressValue(item.progress),
    total: mediaType === "anime" ? normalizeProgressValue(item.total ?? item.progress_total) : 0,
    score: item.score === "" || item.score == null ? null : numeric(item.score, null),
    genres: normalizeGenres(item.genres),
    people: asArray(item.people).filter(Boolean),
    platforms: asArray(item.platforms).filter(Boolean),
    sourceUrls: asArray(item.sourceUrls || item.source_urls).filter(Boolean),
    favorite: item.favorite === true,
    updated: numeric(item.updated),
    startedAt: String(item.startedAt || item.started_at || ""),
    completedAt: String(item.completedAt || item.completed_at || ""),
    volumeLog: normalizeVolumeLog(item.volumeLog || item.volume_log),
    };
  };

  const ratio = (item) => item.mediaType === "anime" ? progressRatio(item.progress, item.total, item.unit) : null;
  const hasProgress = (value) => value !== "" && value != null && !(typeof value === "number" && value <= 0) && String(value) !== "0";

  const progressText = (item) => {
    const unit = LABEL.unit[item.unit] || item.unit || "";
    const current = progressDisplayValue(item.progress);
    const total = progressDisplayValue(item.total);
    if (item.mediaType === "anime" && hasProgress(item.total)) return `${current} / ${total} ${unit}`.trim();
    if (hasProgress(item.progress)) return uiText(
      item.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress",
      { progress: current, unit },
    ).trim();
    return uiText("library.notStarted");
  };

  const statusMatch = (item, filter, adapters) => {
    const customMatch = adapters.matchesStatusFilter?.(item, filter);
    return typeof customMatch === "boolean"
      ? customMatch
      : mediaStatusMatches(item.status, filter);
  };

  function renderLibrary(container, inputItems, adapters = {}) {
    container.replaceChildren();
    const items = inputItems.map(normalize);
    const genres = [...new Set(items.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    const initialState = adapters.initialState || {};
    const initialView = ["grid", "list", "poster"].includes(initialState.view || adapters.initialView) ? (initialState.view || adapters.initialView) : "grid";
    const initialType = ["all", "anime", "manga", "novel"].includes(initialState.type) ? initialState.type : "all";
    const statusOptions = (type) => [
      ...statusFilterOptions(type),
      ...asArray(adapters.extraStatusFilters?.(type)),
    ];
    const initialStatus = String(initialState.status || "");
    const initialStatusKeys = new Set(statusOptions(initialType).map(([key]) => key));
    const state = {
      type: initialType,
      status: initialStatusKeys.has(initialStatus) ? initialStatus : normalizeStatusFilter(initialStatus),
      genre: initialState.genre || "all",
      query: initialState.query || "",
      sort: initialState.sort || "completed-desc",
      view: initialView,
    };
    const openFile = adapters.openFile || (() => {});
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
    [["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([key, label]) => {
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
      timelineButton.addEventListener("click", () => openTimeline());
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
    const typeButtons = new Map();
    [["all", uiText("library.tabAll")], ["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([key, label]) => {
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
    searchInput.addEventListener("input", () => { state.query = searchInput.value.trim().toLocaleLowerCase(); update(); });
    searchWrap.append(searchIcon, searchInput);

    const genreWrap = makeEl("label", "al-sort al-genre-filter");
    const genreSelect = makeEl("select");
    [["all", uiText("library.genreAll")], ...genres.map((genre) => [genre, genre])].forEach(([value, text]) => {
      const option = makeEl("option", "", text);
      option.value = value;
      genreSelect.appendChild(option);
    });
    if (genres.includes(state.genre)) genreSelect.value = state.genre;
    else state.genre = "all";
    genreSelect.addEventListener("change", () => { state.genre = genreSelect.value; update(); });
    genreWrap.appendChild(genreSelect);

    const sortWrap = makeEl("label", "al-sort");
    const sortIcon = makeEl("span", "al-icon");
    setAnimeListIcon(sortIcon, "sort");
    const sortSelect = makeEl("select");
    [
      ["completed-desc", uiText("library.sort.completedDesc")], ["completed-asc", uiText("library.sort.completedAsc")],
      ["updated-desc", uiText("library.sort.updatedDesc")], ["updated-asc", uiText("library.sort.updatedAsc")], ["score-desc", uiText("library.sort.scoreDesc")], ["score-asc", uiText("library.sort.scoreAsc")],
      ["started-desc", uiText("library.sort.startedDesc")], ["started-asc", uiText("library.sort.startedAsc")],
      ["year-desc", uiText("library.sort.yearDesc")], ["year-asc", uiText("library.sort.yearAsc")], ["progress-desc", uiText("library.sort.progressDesc")], ["title-asc", uiText("library.sort.titleAsc")],
    ].forEach(([value, text]) => {
      const option = makeEl("option", "", text);
      option.value = value;
      option.selected = value === state.sort;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    sortWrap.append(sortIcon, sortSelect);

    const views = makeEl("div", "al-view-switch");
    const viewButtons = new Map();
    [["grid", "grid", uiText("library.view.grid")], ["list", "list", uiText("library.view.list")], ["poster", "poster", uiText("library.view.poster")]].forEach(([key, icon, label]) => {
      const button = makeEl("button", `al-view-button${key === state.view ? " is-active" : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      setAnimeListIcon(button, icon);
      button.addEventListener("click", () => {
        state.view = key;
        if (adapters.onViewChange) adapters.onViewChange(key);
        viewButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        update();
      });
      viewButtons.set(key, button);
      views.appendChild(button);
    });
    toolbar.append(searchWrap, genreWrap, sortWrap, views);
    shell.appendChild(toolbar);

    const statusBar = makeEl("div", "al-status-bar");
    const statusButtons = new Map();
    const renderStatusButtons = () => {
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
    const cardCache = new Map();
    const coverSizes = (view) => view === "list"
      ? "116px"
      : view === "poster"
        ? "(max-width: 440px) 50vw, 180px"
        : "(max-width: 780px) 50vw, (min-width: 1500px) 20vw, 240px";
    const eagerCoverCount = (view) => view === "poster" ? 10 : view === "list" ? 4 : 6;

    const makeCard = (item) => {
      const card = makeEl("article", `al-card status-${item.status}`);
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.addEventListener("click", () => openFile(item.filePath));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFile(item.filePath); }
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
        const reveal = () => image.classList.add("is-loaded");
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
      badges.appendChild(makeEl("span", "al-format-badge", `${LABEL.type[item.mediaType] || item.mediaType} · ${item.year || "—"}`));
      if (item.score != null) badges.appendChild(makeEl("span", "al-score-badge", `★ ${item.score.toFixed(1)}`));
      top.appendChild(badges);
      const topActions = makeEl("div", "al-card-top-actions");
      if (toggleFavorite) {
        const favoriteButton = makeEl("button", `al-favorite-button${item.favorite ? " is-active" : ""}`, item.favorite ? "★" : "☆");
        favoriteButton.type = "button";
        favoriteButton.title = item.favorite ? uiText("library.favoriteRemove") : uiText("library.favoriteAdd");
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
        favoriteButton.setAttribute("aria-pressed", item.favorite ? "true" : "false");
        favoriteButton.addEventListener("click", async (event) => {
          event.preventDefault(); event.stopPropagation(); favoriteButton.disabled = true;
          try { await toggleFavorite(item.filePath, !item.favorite); }
          finally { favoriteButton.disabled = false; }
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
      else if (item.mediaType !== "anime") progressRow.appendChild(makeEl("span", "al-release-label", LABEL.releaseStatus[item.releaseStatus] || uiText("media.release.unknown")));
      progress.appendChild(progressRow);
      body.appendChild(progress);
      const footer = makeEl("div", "al-card-footer");
      footer.append(makeEl("span", "al-updated", item.updatedLabel || ""), makeEl("span", "al-score", item.score == null ? uiText("library.unrated") : `★ ${item.score.toFixed(1)}`));
      body.appendChild(footer);
      card.append(media, body);
      return card;
    };

    function update() {
      const query = state.query;
      let filtered = items.filter((item) => {
        if (state.type !== "all" && item.mediaType !== state.type) return false;
        if (!statusMatch(item, state.status, adapters)) return false;
        if (state.genre !== "all" && !item.genres.includes(state.genre)) return false;
        if (!query) return true;
        return [item.title, item.originalTitle, item.format, ...item.genres, ...item.people, ...item.platforms].join(" ").toLocaleLowerCase().includes(query);
      });
      const missingLast = (value, direction) => value ? value : direction > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
      const sorters = {
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
      resultTitle.textContent = state.type === "all" ? uiText("library.resultAll") : LABEL.type[state.type];
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
        return;
      }
      const eagerCount = eagerCoverCount(state.view);
      filtered.forEach((item, index) => {
        let card = cardCache.get(item.filePath);
        if (!card) {
          card = makeCard(item);
          cardCache.set(item.filePath, card);
        }
        const image = card.querySelector("img.al-cover");
        if (image) {
          image.loading = index < eagerCount ? "eager" : "lazy";
          image.fetchPriority = index < 2 ? "high" : "auto";
          image.sizes = coverSizes(state.view);
        }
        grid.appendChild(card);
      });
      if (adapters.onStateChange) adapters.onStateChange({ ...state });
    }

    update();
  }

  return { renderLibrary };
})();

function assignTimelineLanes(positionedItems, minimumDistance) {
  const laneEnds = [];
  return positionedItems.map((positioned) => {
    let lane = laneEnds.findIndex((lastX) => positioned.x - lastX >= minimumDistance);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = positioned.x;
    return { ...positioned, lane };
  });
}

function filterTimelineEntries(items, mediaType) {
  if (mediaType !== "anime" && mediaType !== "manga" && mediaType !== "novel") return items;
  return items.filter((item) => item.mediaType === mediaType);
}

export const TimelineUI = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_DAY_SPACING = MIN_TIMELINE_DAY_SPACING;
  const MAX_DAY_SPACING = MAX_TIMELINE_DAY_SPACING;
  const MIN_VIEW_SCALE = MIN_TIMELINE_VIEW_SCALE;
  const MAX_VIEW_SCALE = MAX_TIMELINE_VIEW_SCALE;
  const CARD_WIDTH = 120;
  const CARD_HEIGHT = 146;
  const CARD_GAP_X = 16;
  const CARD_GAP_Y = 18;
  const STEM_GAP = 44;
  const SCENE_PADDING_Y = 56;
  const dayStart = (value) => {
    const time = parseDateValue(value);
    if (!time) return 0;
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const formatDate = (time) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const tickStepForSpacing = (spacing) => {
    const candidates = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730];
    return candidates.find((step) => step * spacing >= 88) || 1460;
  };

  function render(container, inputItems, adapters = {}) {
    container.replaceChildren();
    const allItems = expandTimelineEntries(inputItems)
      .map((item) => ({ ...item, completedTime: dayStart(item.completedAt || item.completed_at) }))
      .filter((item) => item.completedTime)
      .sort((a, b) => a.completedTime - b.completedTime || compareTimelineEntries(a, b));
    if (!allItems.length) {
      const empty = makeEl("div", "al-timeline-empty");
      setAnimeListIcon(empty, "timeline");
      empty.append(
        makeEl("strong", "", uiText("timeline.emptyTitle")),
        makeEl("span", "", uiText("timeline.emptyDescription")),
      );
      container.appendChild(empty);
      return { items: 0 };
    }

    const selectedType = adapters.typeFilter === "anime"
      || adapters.typeFilter === "manga"
      || adapters.typeFilter === "novel"
      ? adapters.typeFilter
      : "all";
    const items = filterTimelineEntries(allItems, selectedType);

    const sidePadding = 170;
    const grouped = new Map();
    for (const item of items) {
      const key = item.completedTime;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const dates = [...grouped.keys()].sort((a, b) => a - b);
    const minTime = dates[0] || 0;
    const maxTime = dates[dates.length - 1] || minTime;
    const rangeDays = Math.max(1, Math.round((maxTime - minTime) / DAY_MS));
    const defaultView = calculateDefaultTimelineView(
      items.map((item) => item.completedTime),
      rangeDays,
      adapters.maxStackDepth,
    );
    const baseSpacing = defaultView.daySpacing;
    const state = {
      x: 0,
      y: 0,
      daySpacing: defaultView.daySpacing,
      viewScale: defaultView.viewScale,
      sceneWidth: 0,
      sceneHeight: 0,
      axisY: 0,
      latestItemCenterX: 0,
    };

    const root = makeEl("div", "al-timeline-root");
    const toolbar = makeEl("div", "al-timeline-toolbar");
    const copy = makeEl("div", "al-timeline-copy");
    copy.append(
      makeEl("strong", "", uiText("timeline.title")),
      makeEl("span", "", items.length
        ? uiText("timeline.summary", { count: items.length, start: formatDate(minTime), end: formatDate(maxTime) })
        : uiText("timeline.summaryEmpty")),
    );
    const typeFilters = makeEl("div", "al-timeline-type-filters");
    typeFilters.setAttribute("role", "group");
    typeFilters.setAttribute("aria-label", uiText("timeline.title"));
    const typeOptions = [
      ["all", uiText("timeline.filterAll")],
      ["anime", uiText("media.type.anime")],
      ["manga", uiText("media.type.manga")],
      ["novel", uiText("media.type.novel")],
    ];
    for (const [type, label] of typeOptions) {
      const button = makeEl("button", `al-timeline-type-filter${selectedType === type ? " is-active" : ""}`, label);
      button.type = "button";
      button.setAttribute("aria-pressed", selectedType === type ? "true" : "false");
      button.addEventListener("click", () => {
        if (selectedType === type) return;
        render(container, inputItems, { ...adapters, typeFilter: type });
      });
      typeFilters.appendChild(button);
    }
    const controls = makeEl("div", "al-timeline-controls");
    const spacingControls = makeEl("div", "al-timeline-control-group");
    spacingControls.setAttribute("role", "group");
    spacingControls.setAttribute("aria-label", uiText("timeline.spacingControls"));
    const zoomOut = makeEl("button", "", "");
    zoomOut.type = "button"; zoomOut.title = uiText("timeline.zoomOut"); zoomOut.setAttribute("aria-label", zoomOut.title); setAnimeListIcon(zoomOut, "minus");
    const zoomLabel = makeEl("span", "al-timeline-zoom", "100%");
    const zoomIn = makeEl("button", "", "");
    zoomIn.type = "button"; zoomIn.title = uiText("timeline.zoomIn"); zoomIn.setAttribute("aria-label", zoomIn.title); setAnimeListIcon(zoomIn, "plus");
    spacingControls.append(zoomOut, zoomLabel, zoomIn);

    const scaleControls = makeEl("div", "al-timeline-control-group");
    scaleControls.setAttribute("role", "group");
    scaleControls.setAttribute("aria-label", uiText("timeline.scaleControls"));
    const scaleOut = makeEl("button", "", "");
    scaleOut.type = "button"; scaleOut.title = uiText("timeline.scaleOut"); scaleOut.setAttribute("aria-label", scaleOut.title); setAnimeListIcon(scaleOut, "minus");
    const scaleLabel = makeEl("span", "al-timeline-scale", uiText("timeline.scaleLabel", { percent: 100 }));
    const scaleIn = makeEl("button", "", "");
    scaleIn.type = "button"; scaleIn.title = uiText("timeline.scaleIn"); scaleIn.setAttribute("aria-label", scaleIn.title); setAnimeListIcon(scaleIn, "plus");
    scaleControls.append(scaleOut, scaleLabel, scaleIn);

    const reset = makeEl("button", "", "");
    reset.type = "button"; reset.title = uiText("timeline.reset"); reset.setAttribute("aria-label", reset.title); setAnimeListIcon(reset, "rotate-ccw");
    const fit = makeEl("button", "", "");
    fit.type = "button"; fit.title = uiText("timeline.fit"); fit.setAttribute("aria-label", fit.title); setAnimeListIcon(fit, "fit");
    controls.append(spacingControls, scaleControls, reset, fit);
    controls.hidden = !items.length;
    toolbar.append(copy, typeFilters, controls);
    root.appendChild(toolbar);

    if (!items.length) {
      const empty = makeEl("div", "al-timeline-empty");
      setAnimeListIcon(empty, "timeline");
      empty.append(
        makeEl("strong", "", uiText("timeline.emptyTitle")),
        makeEl("span", "", uiText("timeline.emptyDescription")),
      );
      root.appendChild(empty);
      container.appendChild(root);
      return { items: 0, totalItems: allItems.length, type: selectedType };
    }

    const viewport = makeEl("div", "al-timeline-viewport");
    const scene = makeEl("div", "al-timeline-scene");
    viewport.appendChild(scene);
    root.appendChild(viewport);
    container.appendChild(root);
    const openFile = adapters.openFile || (() => {});

    const applyPan = () => {
      scene.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.viewScale})`;
      zoomLabel.textContent = uiText("timeline.zoomLabel", { percent: Math.round((state.daySpacing / baseSpacing) * 100), spacing: state.daySpacing.toFixed(state.daySpacing < 10 ? 1 : 0) });
      scaleLabel.textContent = uiText("timeline.scaleLabel", { percent: Math.round(state.viewScale * 100) });
    };

    const renderGeometry = () => {
      scene.replaceChildren();
      const viewportWidth = Math.max(720, viewport.clientWidth || 1200);
      state.sceneWidth = Math.max(viewportWidth / state.viewScale, sidePadding * 2 + rangeDays * state.daySpacing);

      const positionedItems = items.map((item) => ({
        item,
        time: item.completedTime,
        x: sidePadding + Math.round((item.completedTime - minTime) / DAY_MS) * state.daySpacing,
      }));
      const laidOutItems = assignTimelineLanes(
        positionedItems,
        CARD_WIDTH + CARD_GAP_X,
      );
      const laneCount = Math.max(1, ...laidOutItems.map((positioned) => positioned.lane + 1));
      const aboveLaneCount = Math.ceil(laneCount / 2);
      const belowLaneCount = Math.floor(laneCount / 2);
      const axisY = SCENE_PADDING_Y + STEM_GAP
        + aboveLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;
      state.axisY = axisY;
      state.sceneHeight = axisY + SCENE_PADDING_Y
        + (belowLaneCount > 0
          ? STEM_GAP + belowLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y
          : 0);

      scene.style.width = `${state.sceneWidth}px`;
      scene.style.height = `${state.sceneHeight}px`;

      const axis = makeEl("div", "al-timeline-axis");
      axis.style.left = `${sidePadding}px`;
      axis.style.top = `${axisY}px`;
      axis.style.width = `${Math.max(1, rangeDays * state.daySpacing)}px`;
      scene.appendChild(axis);

      const tickStep = tickStepForSpacing(state.daySpacing);
      for (let day = 0; day <= rangeDays; day += tickStep) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + day * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(minTime + day * DAY_MS)));
        scene.appendChild(tick);
      }
      if (rangeDays % tickStep !== 0) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + rangeDays * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(maxTime)));
        scene.appendChild(tick);
      }

      dates.forEach((time) => {
        const x = sidePadding + Math.round((time - minTime) / DAY_MS) * state.daySpacing;
        const dayMarker = makeEl("div", "al-timeline-day-marker");
        dayMarker.style.left = `${x - 5}px`;
        dayMarker.style.top = `${axisY - 5}px`;
        scene.appendChild(dayMarker);
      });

      laidOutItems.forEach(({ item, time, x, lane }, index) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        const stemStart = aboveAxis ? cardY + CARD_HEIGHT : axisY;
        const stemEnd = aboveAxis ? axisY : cardY;
        const stem = makeEl("div", "al-timeline-stem");
        stem.style.left = `${x}px`;
        stem.style.top = `${stemStart}px`;
        stem.style.height = `${Math.max(1, stemEnd - stemStart)}px`;
        scene.appendChild(stem);

        const card = makeEl("button", "al-timeline-card");
        card.type = "button";
        card.dataset.timelineLane = String(lane);
        card.style.left = `${x - CARD_WIDTH / 2}px`;
        card.style.top = `${cardY}px`;
        card.title = uiText("timeline.cardTitle", { title: item.title, date: formatDate(time) });
        if (item.cover) {
          const image = makeEl("img", "", "");
          image.src = item.cover;
          image.alt = uiText("timeline.coverAlt", { title: item.title });
          card.appendChild(image);
        }
        const text = makeEl("span", "al-timeline-card-copy");
        const displayTitle = item.seriesTitle || item.title;
        text.appendChild(makeEl("strong", "", displayTitle));
        if (item.volumeLabel) {
          text.appendChild(makeEl("span", "al-timeline-volume-label", item.serialEntryLabel || uiText("timeline.volumeLabel", { volume: item.volumeLabel })));
        }
        text.appendChild(makeEl("small", "", formatDate(time)));
        card.appendChild(text);
        if (item.score != null) card.appendChild(makeEl("span", "al-timeline-score", `★ ${Number(item.score).toFixed(1)}`));
        card.addEventListener("click", () => openFile(item.filePath));
        scene.appendChild(card);
        if (index === laidOutItems.length - 1) state.latestItemCenterX = x;
      });
      applyPan();
    };

    const setDaySpacingAt = (nextSpacing, clientX) => {
      const rect = viewport.getBoundingClientRect();
      const localX = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
      const previous = state.daySpacing;
      const next = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, nextSpacing));
      if (Math.abs(next - previous) < 1e-6) return;
      const dayAtCursor = (((localX - state.x) / state.viewScale) - sidePadding) / previous;
      const previousAxisY = state.axisY;
      state.daySpacing = next;
      renderGeometry();
      state.x = localX - (sidePadding + dayAtCursor * next) * state.viewScale;
      state.y = preserveTimelineAxisScreenY(
        state.y,
        previousAxisY,
        state.axisY,
        state.viewScale,
      );
      applyPan();
    };

    const setViewScaleAt = (nextScale, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const localX = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
      const localY = Number.isFinite(clientY) ? clientY - rect.top : viewport.clientHeight / 2;
      const previous = state.viewScale;
      const next = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, nextScale));
      if (Math.abs(next - previous) < 1e-6) return;
      const sceneX = (localX - state.x) / previous;
      const sceneY = (localY - state.y) / previous;
      state.viewScale = next;
      renderGeometry();
      state.x = localX - sceneX * next;
      state.y = localY - sceneY * next;
      applyPan();
    };

    const centerScene = () => {
      state.x = (viewport.clientWidth - state.sceneWidth * state.viewScale) / 2;
      state.y = (viewport.clientHeight - state.sceneHeight * state.viewScale) / 2;
      applyPan();
    };

    const centerLatestItem = () => {
      const pan = centerLatestTimelineAxis(
        viewport.clientWidth,
        viewport.clientHeight,
        state.latestItemCenterX,
        state.axisY,
        state.viewScale,
      );
      state.x = pan.x;
      state.y = pan.y;
      applyPan();
    };

    const resetView = () => {
      state.daySpacing = defaultView.daySpacing;
      state.viewScale = defaultView.viewScale;
      renderGeometry();
      centerLatestItem();
    };

    const fitScene = () => {
      const availableWidth = Math.max(260, viewport.clientWidth / state.viewScale - sidePadding * 2);
      state.daySpacing = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, availableWidth / rangeDays));
      renderGeometry();
      centerScene();
    };

    const viewportCenter = () => {
      const rect = viewport.getBoundingClientRect();
      return { x: rect.left + viewport.clientWidth / 2, y: rect.top + viewport.clientHeight / 2 };
    };
    zoomIn.addEventListener("click", () => { const center = viewportCenter(); setDaySpacingAt(state.daySpacing * 1.25, center.x); });
    zoomOut.addEventListener("click", () => { const center = viewportCenter(); setDaySpacingAt(state.daySpacing / 1.25, center.x); });
    scaleIn.addEventListener("click", () => { const center = viewportCenter(); setViewScaleAt(state.viewScale * 1.15, center.x, center.y); });
    scaleOut.addEventListener("click", () => { const center = viewportCenter(); setViewScaleAt(state.viewScale / 1.15, center.x, center.y); });
    reset.addEventListener("click", resetView);
    fit.addEventListener("click", fitScene);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) setDaySpacingAt(state.daySpacing * Math.exp(-event.deltaY * 0.002), event.clientX);
      else {
        state.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
        state.y -= event.shiftKey ? 0 : event.deltaY;
        applyPan();
      }
    }, { passive: false });

    let dragging = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".al-timeline-card")) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      state.x = dragging.startX + event.clientX - dragging.x;
      state.y = dragging.startY + event.clientY - dragging.y;
      applyPan();
    });
    const stopDrag = (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);

    renderGeometry();
    window.setTimeout(resetView, 0);
    return {
      items: items.length,
      totalItems: allItems.length,
      type: selectedType,
      fitScene,
      resetView,
      getDaySpacing: () => state.daySpacing,
      getViewScale: () => state.viewScale,
      getSceneWidth: () => state.sceneWidth,
    };
  }

  return { render };
})();

function createLabeledField(parent, labelText, input, hintText = "") {
  const wrapper = createEl("label");
  wrapper.className = "al-form-field";
  const label = createSpan();
  label.className = "al-form-label";
  label.textContent = labelText;
  wrapper.append(label, input);
  if (hintText) wrapper.appendChild(makeEl("small", "al-form-hint", hintText));
  parent.appendChild(wrapper);
  return input;
}

function normalizeDateParts(year, month, day) {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return "";
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(yearNumber, monthNumber - 1, dayNumber);
  if (date.getFullYear() !== yearNumber || date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) return "";
  return `${year}-${month}-${day}`;
}

function focusNextFormControl(control) {
  const scope = control.closest(".modal-content") || control.ownerDocument.body;
  const controls = [...scope.querySelectorAll("input, select, textarea, button, [tabindex]")]
    .filter((candidate) => !candidate.disabled && candidate.tabIndex >= 0 && candidate.offsetParent !== null);
  const index = controls.indexOf(control);
  controls[index + 1]?.focus();
}

function createDateInput(value = "") {
  const root = createDiv();
  root.className = "al-date-input";
  root.setAttribute("role", "group");
  const year = createEl("input");
  const month = createEl("input");
  const day = createEl("input");
  const segments = [
    [year, 4, "YYYY", uiText("date.year")],
    [month, 2, "MM", uiText("date.month")],
    [day, 2, "DD", uiText("date.day")],
  ];
  for (const [input, length, placeholder, label] of segments) {
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = length;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", label);
  }
  year.className = "al-date-year";
  month.className = "al-date-month";
  day.className = "al-date-day";
  root.append(year, makeEl("span", "al-date-separator", "-"), month, makeEl("span", "al-date-separator", "-"), day);

  const emit = (name) => root.dispatchEvent(new Event(name, { bubbles: true }));
  const setValue = (nextValue) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nextValue || ""));
    year.value = match?.[1] || "";
    month.value = match?.[2] || "";
    day.value = match?.[3] || "";
  };
  Object.defineProperty(root, "value", {
    configurable: true,
    get: () => normalizeDateParts(year.value, month.value, day.value),
    set: setValue,
  });
  Object.defineProperty(root, "required", {
    configurable: true,
    get: () => year.required,
    set: (required) => {
      year.required = Boolean(required);
      month.required = Boolean(required);
      day.required = Boolean(required);
      root.setAttribute("aria-required", required ? "true" : "false");
    },
  });

  const bindSegment = (input, maxLength, nextInput = null) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, maxLength);
      if (input.value.length !== maxLength) return;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else focusNextFormControl(input);
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace" || input.value) return;
      const previous = input === day ? month : input === month ? year : null;
      if (previous) {
        event.preventDefault();
        previous.focus();
        previous.select();
      }
    });
  };
  bindSegment(year, 4, month);
  bindSegment(month, 2, day);
  bindSegment(day, 2);
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) emit("change");
  });
  setValue(value);
  return root;
}

function createTextInput(type = "text", value = "") {
  if (type === "date") return createDateInput(value);
  const input = createEl("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  return input;
}

function createSelect(options, selected) {
  const select = createEl("select");
  options.forEach(([value, text]) => {
    const option = createEl("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selected;
    select.appendChild(option);
  });
  return select;
}

function bindCompletionBehavior(status, total, progress, completedAt, noteEl = null, mediaType = "anime") {
  const sync = () => {
    const completed = status.value === "completed";
    const autoProgress = mediaType === "anime" && completed;
    progress.readOnly = autoProgress;
    progress.classList.toggle("is-auto", autoProgress);
    if (autoProgress) {
      const normalizedTotal = Math.max(0, numeric(total?.value));
      if (normalizedTotal > 0) progress.value = progressDisplayValue(normalizedTotal);
      if (completedAt && !completedAt.value) completedAt.value = todayString();
    } else if (completed && completedAt && !completedAt.value) {
      completedAt.value = todayString();
    }
    if (completedAt) completedAt.required = completed;
    if (noteEl) {
      if (mediaType === "anime") {
        noteEl.textContent = completed
          ? uiText("completion.animeCompleted", { status: completedStatusLabel("anime") })
          : uiText("completion.animeActive");
      } else {
        noteEl.textContent = completed
          ? uiText("completion.readingCompleted")
          : uiText("completion.readingActive");
      }
    }
  };
  status.addEventListener("change", sync);
  total?.addEventListener("input", sync);
  sync();
  return sync;
}

function bindScoreRequirement(status, score, mediaType = "anime") {
  const sync = () => {
    const required = status.value === "completed";
    score.required = required;
    score.setAttribute("aria-required", required ? "true" : "false");
    score.placeholder = required
      ? uiText("completion.requiredPlaceholder", { status: completedStatusLabel(mediaType === "anime" ? "anime" : mediaType === "manga" ? "manga" : "novel") })
      : uiText("common.optional");
  };
  status.addEventListener("change", sync);
  sync();
  return sync;
}

function genreInputValues(input) {
  return normalizeGenres(String(input?.value || "").split(/[、,，;；\n]+/));
}

function releaseStatusOptions(selected = "unknown") {
  return createSelect([
    ["releasing", uiText("media.release.releasing")],
    ["finished", uiText("media.release.finished")],
    ["hiatus", uiText("media.release.hiatus")],
    ["cancelled", uiText("media.release.cancelled")],
    ["unknown", uiText("media.release.unknown")],
  ], normalizeReleaseStatus(selected));
}

function validateNovelProgress(value, label, optional = false) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text && optional) return 0;
  if (!text || text === "0") return 0;
  const normalized = normalizeVolumeLabel(text);
  if (normalized === null) throw new Error(uiText("validation.volumeFormat", { label }));
  return normalized === "EX" ? "EX" : Number(normalized);
}

function createNovelVolumeEditor(parent, initialEntries = []) {
  const section = makeEl("section", "al-volume-editor");
  const header = makeEl("div", "al-volume-editor-header");
  const copy = makeEl("div", "");
  copy.append(
    makeEl("strong", "", uiText("volume.title")),
    makeEl("small", "", uiText("volume.description")),
  );
  const add = makeEl("button", "al-secondary-button", uiText("volume.add"));
  add.type = "button";
  header.append(copy, add);
  const rows = makeEl("div", "al-volume-editor-rows");
  section.append(header, rows);
  parent.appendChild(section);

  const entries = normalizeVolumeLog(initialEntries).map((entry) => ({ ...entry }));

  const nextLabel = () => {
    const numericLabels = entries
      .map((entry) => normalizeVolumeLabel(entry.label))
      .filter((label) => label && label !== "EX")
      .map(Number)
      .filter(Number.isFinite);
    return numericLabels.length ? String(Math.floor(Math.max(...numericLabels)) + 1) : "1";
  };

  const revealVolumeRow = (row, labelInput, { highlight = false, select = false } = {}) => {
    if (highlight) row.classList.add("al-volume-row-new");
    const reveal = () => {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      labelInput.focus({ preventScroll: true });
      if (select) labelInput.select();
      if (highlight) {
        row.ownerDocument.defaultView?.setTimeout(() => row.classList.remove("al-volume-row-new"), 1400);
      }
    };
    const view = row.ownerDocument.defaultView;
    if (view?.requestAnimationFrame) view.requestAnimationFrame(() => view.requestAnimationFrame(reveal));
    else view?.setTimeout(reveal, 0);
  };

  const render = ({ revealEntry = null, highlightEntry = false, selectLabel = false } = {}) => {
    rows.replaceChildren();
    entries.sort((left, right) => compareVolumeLabels(left.label, right.label));
    if (!entries.length) {
      rows.appendChild(makeEl("p", "al-volume-editor-empty", uiText("volume.empty")));
    }

    entries.forEach((entry, index) => {
      const row = makeEl("div", "al-volume-row");
      const fields = makeEl("div", "al-volume-row-fields");
      const labelInput = createLabeledField(fields, uiText("volume.label"), createTextInput("text", entry.label), uiText("volume.labelPlaceholder"));
      const startedInput = createLabeledField(fields, uiText("volume.startedAt"), createTextInput("date", entry.startedAt || ""));
      const completedInput = createLabeledField(fields, uiText("volume.completedAt"), createTextInput("date", entry.completedAt || todayString()), uiText("volume.completedHint"));
      if (!entry.completedAt) entry.completedAt = completedInput.value;
      const actions = makeEl("div", "al-volume-row-actions");
      const remove = makeEl("button", "al-delete-button", uiText("action.remove"));
      remove.type = "button";
      actions.appendChild(remove);
      row.append(fields, actions);
      rows.appendChild(row);

      labelInput.addEventListener("input", () => { entry.label = labelInput.value; });
      labelInput.addEventListener("change", () => {
        const normalizedLabel = normalizeVolumeLabel(labelInput.value);
        if (!normalizedLabel) return;
        entry.label = normalizedLabel;
        render({ revealEntry: entry });
      });
      startedInput.addEventListener("input", () => { entry.startedAt = startedInput.value; });
      completedInput.addEventListener("input", () => { entry.completedAt = completedInput.value; });
      completedInput.addEventListener("change", () => {
        if (!completedInput.value) completedInput.value = todayString();
        entry.completedAt = completedInput.value;
      });
      remove.addEventListener("click", () => {
        entries.splice(index, 1);
        render();
      });

      if (entry === revealEntry) {
        revealVolumeRow(row, labelInput, { highlight: highlightEntry, select: selectLabel });
      }
    });
  };

  add.addEventListener("click", () => {
    const entry = { label: nextLabel(), startedAt: "", completedAt: todayString() };
    entries.push(entry);
    render({ revealEntry: entry, highlightEntry: true, selectLabel: true });
  });
  render();

  return {
    getEntries() {
      const output = [];
      const seen = new Set();
      for (const entry of entries) {
        const label = normalizeVolumeLabel(entry.label);
        if (!label) throw new Error(uiText("validation.volumeInvalid", { value: entry.label || uiText("common.emptyValue") }));
        if (seen.has(label)) throw new Error(uiText("validation.volumeDuplicate", { volume: label }));
        seen.add(label);
        output.push({
          label,
          startedAt: entry.startedAt || "",
          completedAt: entry.completedAt || todayString(),
        });
      }
      return output.sort((left, right) => compareVolumeLabels(left.label, right.label));
    },
  };
}

class AddMediaModal extends Modal {
  constructor(plugin, initialType = "anime") {
    super(plugin.app);
    this.plugin = plugin;
    this.mediaType = ["anime", "manga", "novel"].includes(initialType) ? initialType : "anime";
    this.query = "";
    this.results = [];
    this.warnings = [];
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal");
    this.renderSearch();
  }

  renderSearch() {
    this.contentEl.replaceChildren();
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const headingCopy = makeEl("div");
    headingCopy.append(
      makeEl("div", "al-kicker", uiText("add.kicker")),
      makeEl("h2", "", uiText("add.title")),
      makeEl("p", "", uiText("add.description")),
    );
    heading.appendChild(headingCopy);
    this.contentEl.appendChild(heading);

    const typeTabs = createDiv();
    typeTabs.className = "al-modal-type-tabs";
    [["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([value, text]) => {
      const button = createEl("button");
      button.type = "button";
      button.className = `al-modal-type${this.mediaType === value ? " is-active" : ""}`;
      button.textContent = text;
      button.addEventListener("click", () => {
        this.mediaType = value;
        this.results = [];
        this.warnings = [];
        this.renderSearch();
      });
      typeTabs.appendChild(button);
    });
    this.contentEl.appendChild(typeTabs);

    const searchRow = createDiv();
    searchRow.className = "al-modal-search-row";
    const input = createTextInput("search", this.query);
    input.placeholder = this.mediaType === "anime" ? uiText("add.placeholderAnime") : this.mediaType === "manga" ? uiText("add.placeholderManga") : uiText("add.placeholderNovel");
    const button = createEl("button");
    button.type = "button";
    button.className = "mod-cta";
    button.textContent = uiText("action.search");
    const runSearch = () => {
      this.query = input.value.trim();
      if (!this.query) { new Notice(uiText("notice.searchQueryRequired")); return; }
      this.search(button);
    };
    button.addEventListener("click", runSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
    searchRow.append(input, button);
    this.contentEl.appendChild(searchRow);

    const hint = createEl("p");
    hint.className = "al-modal-hint";
    hint.textContent = this.mediaType === "novel"
      ? uiText("add.hintNovel")
      : uiText("add.hintMedia");
    this.contentEl.appendChild(hint);

    if (this.warnings.length) {
      const warning = createDiv();
      warning.className = "al-modal-warning";
      warning.textContent = uiText("add.warning", { warnings: this.warnings.join("；") });
      this.contentEl.appendChild(warning);
    }

    const resultsEl = createDiv();
    resultsEl.className = "al-search-results";
    if (!this.results.length && this.query) {
      const empty = createDiv();
      empty.className = "al-search-empty";
      empty.textContent = uiText("add.emptyResult");
      resultsEl.appendChild(empty);
    }
    this.results.forEach((result) => resultsEl.appendChild(this.createResultRow(result)));
    this.contentEl.appendChild(resultsEl);
    window.setTimeout(() => input.focus(), 0);
  }

  async search(button) {
    button.disabled = true;
    button.textContent = uiText("add.searching");
    try {
      const response = await this.plugin.searchExternal(this.mediaType, this.query);
      this.results = response.results;
      this.warnings = response.warnings;
      if (!this.results.length) new Notice(uiText("notice.searchNoResults"));
    } catch (error) {
      console.error("AnimeList external search failed", error);
      this.results = [];
      this.warnings = [error?.message || String(error)];
      new Notice(uiText("notice.searchUnavailable"));
    }
    this.renderSearch();
  }

  createResultRow(result) {
    const row = createEl("button");
    row.type = "button";
    row.className = "al-search-result";
    if (result.coverUrl) {
      const image = createEl("img");
      image.src = result.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      row.appendChild(image);
    } else {
      const placeholder = createDiv();
      placeholder.className = "al-search-result-placeholder";
      placeholder.textContent = uiText("add.noCover");
      row.appendChild(placeholder);
    }
    const body = createDiv();
    body.className = "al-search-result-body";
    const title = createEl("strong");
    title.textContent = result.title;
    const original = createSpan();
    original.textContent = result.originalTitle || result.romajiTitle || "";
    const meta = createSpan();
    meta.textContent = [mediaProviderLabel(result.provider), result.year || uiText("add.unknownYear"), mediaFormatLabel(result.format)].filter(Boolean).join(" · ");
    body.append(title, original, meta);
    const use = createSpan();
    use.className = "al-search-result-use";
    use.textContent = uiText("action.select");
    row.append(body, use);
    row.addEventListener("click", () => this.renderDetails(result));
    return row;
  }

  async renderDetails(result) {
    this.contentEl.replaceChildren();
    const back = createEl("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = uiText("action.back");
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const preview = createDiv();
    preview.className = "al-selected-preview";
    if (result.coverUrl) {
      const image = createEl("img");
      image.src = result.coverUrl;
      image.alt = uiText("library.coverAlt", { title: result.title });
      preview.appendChild(image);
    }
    const copy = createDiv();
    copy.append(
      makeEl("div", "al-kicker", mediaProviderLabel(result.provider)),
      makeEl("h2", "", result.title),
      makeEl("p", "", result.originalTitle || result.romajiTitle || ""),
    );
    preview.appendChild(copy);
    this.contentEl.appendChild(preview);

    const templates = await this.plugin.getTemplates(result.mediaType);
    const form = createDiv();
    form.className = "al-media-form";
    const titleInput = createLabeledField(form, uiText("add.titleLabel"), createTextInput("text", result.title), uiText("add.required"));
    titleInput.required = true;
    const statusOptions = mediaStatusOptions();
    const status = createLabeledField(form, uiText("add.statusLabel"), createSelect(statusOptions, "planned"));
    const releaseStatus = result.mediaType === "anime"
      ? null
      : createLabeledField(form, uiText("add.releaseStatusLabel"), releaseStatusOptions(result.releaseStatus));
    const score = createLabeledField(form, uiText("add.scoreLabel"), createTextInput("number", ""), uiText("add.scoreHint", { status: completedStatusLabel(result.mediaType) }));
    score.min = "0"; score.max = "10"; score.step = "0.1";
    bindScoreRequirement(status, score, result.mediaType);
    const startedAt = createLabeledField(form, uiText("add.startedAt"), createTextInput("date", ""), uiText("add.startedHint"));
    const completedAt = createLabeledField(form, uiText("add.completedAt"), createTextInput("date", ""), uiText("add.completedHint", { status: completedStatusLabel(result.mediaType) }));
    const progressType = result.mediaType === "novel" ? "text" : "number";
    const progressLabel = result.mediaType === "manga" ? uiText("add.progressManga") : result.mediaType === "novel" ? uiText("add.progressNovel") : uiText("add.progressAnime");
    const progress = createLabeledField(form, progressLabel, createTextInput(progressType, "0"), result.mediaType === "novel" ? uiText("add.progressNovelHint") : "");
    markMediaFormField(progress, "progress");
    if (result.mediaType !== "novel") { progress.min = "0"; progress.step = "1"; }
    const total = result.mediaType === "anime"
      ? createLabeledField(form, uiText("add.total"), createTextInput("number", result.total || ""))
      : null;
    if (total) { total.min = "0"; total.step = "1"; }
    const unitOptions = result.mediaType === "anime"
      ? [["episode", uiText("media.unit.episode")]]
      : result.mediaType === "manga"
        ? [["chapter", uiText("media.unit.chapter")]]
        : [["volume", uiText("media.unit.volume")]];
    const unit = createLabeledField(form, uiText("add.unit"), createSelect(unitOptions, unitOptions[0][0]));
    const genreInput = createLabeledField(form, uiText("add.genres"), createTextInput("text", normalizeGenres(result.genres).join("、")), uiText("add.genresHint"));
    const templateOptions = templates.length
      ? templates.map((template) => [template.path, template.name])
      : [["", uiText("add.noTemplate")]];
    const templateSelect = createLabeledField(form, uiText("add.template"), createSelect(templateOptions, templateOptions[0][0]), uiText("add.templateHint"));
    const completionNote = makeEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote, result.mediaType);
    const volumeEditor = result.mediaType === "novel"
      ? createNovelVolumeEditor(form, [])
      : null;
    const favoriteWrap = createEl("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = createEl("input");
    favorite.type = "checkbox";
    favoriteWrap.append(favorite, ` ${uiText("add.favorite")}`);
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const sourceNote = createDiv();
    sourceNote.className = "al-source-note";
    sourceNote.textContent = result.mediaType === "novel"
      ? uiText("add.sourceNovel")
      : uiText("add.sourceMedia");
    this.contentEl.appendChild(sourceNote);

    const actions = createDiv();
    actions.className = "al-modal-actions";
    const createButton = createEl("button");
    createButton.type = "button";
    createButton.className = "mod-cta";
    createButton.textContent = uiText("action.collect");
    createButton.addEventListener("click", async () => {
      if (!titleInput.value.trim()) { new Notice(uiText("validation.titleRequired")); return; }
      const hasScore = score.value.trim() !== "";
      const scoreValue = hasScore ? Number(score.value) : null;
      if (status.value === "completed" && !hasScore) { new Notice(`${completedRequirementMessage(result.mediaType, uiText("field.score"))}。`); return; }
      if (hasScore && (scoreValue == null || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 10)) { new Notice(`${uiText("validation.scoreRange")}。`); return; }
      if (status.value === "completed" && !completedAt.value) { new Notice(`${completedRequirementMessage(result.mediaType, uiText("field.completedAt"))}。`); return; }
      createButton.disabled = true;
      createButton.textContent = uiText("add.processing");
      try {
        const volumeLog = volumeEditor ? volumeEditor.getEntries() : [];
        let nextProgress = result.mediaType === "novel" ? validateNovelProgress(progress.value, uiText("add.progressNovel")) : Math.max(0, numeric(progress.value));
        const nextTotal = result.mediaType === "anime" ? Math.max(0, numeric(total?.value)) : 0;
        const completedVolume = highestCompletedVolume(volumeLog);
        if (result.mediaType === "novel" && completedVolume && compareVolumeLabels(nextProgress, completedVolume) < 0) nextProgress = completedVolume === "EX" ? "EX" : Number(completedVolume);
        const file = await this.plugin.createMediaNote(result, {
          title: titleInput.value.trim(), status: status.value, releaseStatus: releaseStatus?.value || "unknown", score: score.value,
          startedAt: startedAt.value, completedAt: completedAt.value,
          progress: nextProgress, total: nextTotal, unit: unit.value,
          favorite: favorite.checked, genres: genreInputValues(genreInput), templatePath: templateSelect.value, volumeLog,
        });
        this.close();
        new Notice(uiText("notice.collected", { title: titleInput.value.trim() }));
        await this.plugin.app.workspace.openLinkText(file.path, "", false);
      } catch (error) {
        console.error("AnimeList create note failed", error);
        new Notice(uiText("notice.createFailed", { error: error?.message || error }));
        createButton.disabled = false;
        createButton.textContent = uiText("action.collect");
      }
    });
    actions.appendChild(createButton);
    this.contentEl.appendChild(actions);
  }
}

class ConfirmDeleteModal extends Modal {
  constructor(plugin, file, onDeleted = null) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.onDeleted = onDeleted;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal", "animelist-confirm-modal");
    const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const title = makeEl("h2", "", uiText("delete.title"));
    const description = makeEl("p", "", uiText("delete.description", { title: fm.title || this.file.basename }));
    const actions = makeEl("div", "al-modal-actions al-confirm-actions");
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const remove = makeEl("button", "mod-warning", uiText("action.delete"));
    remove.type = "button";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await this.plugin.deleteMediaFile(this.file);
        this.close();
        if (this.onDeleted) this.onDeleted();
        new Notice(uiText("notice.deleted"));
      } catch (error) {
        console.error("AnimeList delete failed", error);
        new Notice(uiText("notice.deleteFailed", { error: error?.message || error }));
        remove.disabled = false;
      }
    });
    actions.append(cancel, remove);
    this.contentEl.append(title, description, actions);
  }
}

class EditMediaModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal", "animelist-edit-modal");
    const frontmatter = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const title = createEl("h2");
    title.textContent = uiText("edit.title", { title: frontmatter.title || this.file.basename });
    const description = createEl("p");
    description.textContent = uiText("edit.description");
    heading.append(title, description);
    this.contentEl.appendChild(heading);

    const mediaType = String(frontmatter.media_type || "anime");
    const form = createDiv();
    form.className = "al-media-form";
    const statusOptions = mediaStatusOptions();
    const titleInput = createLabeledField(form, uiText("add.titleLabel"), createTextInput("text", frontmatter.title || this.file.basename), uiText("add.required"));
    titleInput.required = true;
    const currentStatus = normalizeMediaStatus(frontmatter.status);
    const status = createLabeledField(form, uiText("add.statusLabel"), createSelect(statusOptions, currentStatus));
    const releaseStatus = mediaType === "anime"
      ? null
      : createLabeledField(form, uiText("add.releaseStatusLabel"), releaseStatusOptions(frontmatter.release_status));
    const score = createLabeledField(form, uiText("add.scoreLabel"), createTextInput("number", frontmatter.score ?? ""), uiText("add.scoreHint", { status: completedStatusLabel(mediaType) }));
    score.min = "0"; score.max = "10"; score.step = "0.1";
    bindScoreRequirement(status, score, mediaType);
    const progressType = mediaType === "novel" ? "text" : "number";
    const progressLabel = mediaType === "manga" ? uiText("add.progressManga") : mediaType === "novel" ? uiText("add.progressNovel") : uiText("add.progressAnime");
    const progress = createLabeledField(form, progressLabel, createTextInput(progressType, frontmatter.progress ?? 0), mediaType === "novel" ? uiText("add.progressNovelHint") : "");
    markMediaFormField(progress, "progress");
    if (mediaType !== "novel") progress.min = "0";
    const total = mediaType === "anime"
      ? createLabeledField(form, uiText("add.total"), createTextInput("number", frontmatter.progress_total ?? ""))
      : null;
    if (total) total.min = "0";
    const startedAt = createLabeledField(form, uiText("add.startedAt"), createTextInput("date", frontmatter.started_at || ""), uiText("add.startedHint"));
    const completedAt = createLabeledField(form, uiText("add.completedAt"), createTextInput("date", frontmatter.completed_at || ""), uiText("add.completedHint", { status: completedStatusLabel(mediaType) }));
    const genreInput = createLabeledField(form, uiText("add.genres"), createTextInput("text", normalizeGenres(frontmatter.genres).join("、")), uiText("add.genresHint"));
    const completionNote = makeEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote, mediaType);
    const volumeEditor = mediaType === "novel"
      ? createNovelVolumeEditor(form, frontmatter.volume_log)
      : null;
    const favoriteWrap = createEl("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = createEl("input");
    favorite.type = "checkbox";
    favorite.checked = frontmatter.favorite === true;
    favoriteWrap.append(favorite, ` ${uiText("add.favorite")}`);
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const actions = createDiv();
    actions.className = "al-modal-actions al-edit-actions";
    const deleteButton = createEl("button");
    deleteButton.type = "button";
    deleteButton.className = "al-delete-button";
    appendIconLabel(deleteButton, "trash", uiText("action.delete"));
    deleteButton.addEventListener("click", () => {
      new ConfirmDeleteModal(this.plugin, this.file, () => this.close()).open();
    });
    const save = createEl("button");
    save.type = "button";
    save.className = "mod-cta";
    save.textContent = uiText("action.save");
    save.addEventListener("click", async () => {
      const nextTitle = titleInput.value.trim();
      const hasScore = score.value.trim() !== "";
      const nextScore = hasScore ? Number(score.value) : null;
      if (!nextTitle) { new Notice(uiText("validation.titleRequired")); return; }
      if (status.value === "completed" && !hasScore) { new Notice(`${completedRequirementMessage(mediaType, uiText("field.score"))}。`); return; }
      if (hasScore && (nextScore == null || !Number.isFinite(nextScore) || nextScore < 0 || nextScore > 10)) { new Notice(`${uiText("validation.scoreRange")}。`); return; }
      if (status.value === "completed" && !completedAt.value) { new Notice(`${completedRequirementMessage(mediaType, uiText("field.completedAt"))}。`); return; }
      save.disabled = true;
      try {
        const volumeLog = volumeEditor ? volumeEditor.getEntries() : [];
        const nextTotal = mediaType === "anime" ? Math.max(0, numeric(total?.value)) : 0;
        let nextProgress = mediaType === "novel"
          ? validateNovelProgress(progress.value, uiText("add.progressNovel"))
          : Math.max(0, numeric(progress.value));
        const completedVolume = highestCompletedVolume(volumeLog);
        if (mediaType === "novel" && completedVolume && compareVolumeLabels(nextProgress, completedVolume) < 0) nextProgress = completedVolume === "EX" ? "EX" : Number(completedVolume);
        await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => {
          fm.schema_version = CURRENT_MEDIA_SCHEMA_VERSION;
          fm.title = nextTitle;
          fm.status = normalizeMediaStatus(status.value);
          if (mediaType !== "anime") fm.release_status = releaseStatus?.value || "unknown";
          if (mediaType === "anime") fm.progress_total = nextTotal;
          else delete fm.progress_total;
          fm.progress = completedProgress(status.value, nextTotal, nextProgress, mediaType);
          fm.favorite = favorite.checked;
          fm.genres = genreInputValues(genreInput);
          if (nextScore != null) fm.score = nextScore; else delete fm.score;
          if (startedAt.value) fm.started_at = startedAt.value; else delete fm.started_at;
          if (completedAt.value) fm.completed_at = completedAt.value; else delete fm.completed_at;
          if (mediaType === "novel" && volumeLog.length) fm.volume_log = serializeVolumeLog(volumeLog); else delete fm.volume_log;
          delete fm.updated_at;
          delete fm.metadata_updated_at;
        });
        this.close();
        new Notice(uiText("notice.saved"));
      } catch (error) {
        console.error("AnimeList edit failed", error);
        new Notice(uiText("notice.saveFailed", { error: error?.message || error }));
        save.disabled = false;
      }
    });
    actions.append(deleteButton, save);
    this.contentEl.appendChild(actions);
  }
}

export class TimelineModal extends Modal {
  constructor(plugin, items) {
    super(plugin.app);
    this.plugin = plugin;
    this.items = items;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-timeline-modal");
    this.contentEl.replaceChildren();
    TimelineUI.render(this.contentEl, this.items, {
      maxStackDepth: normalizeTimelineMaxStackDepth(
        this.plugin.settings?.timelineMaxStackDepth,
      ),
      openFile: async (path) => {
        this.close();
        await this.plugin.app.workspace.openLinkText(path, "", false);
      },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class AnimeListRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath, config) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.config = config;
    this.renderTimer = null;
    this.viewMode = this.plugin.libraryViewModes?.get(this.sourcePath) || "grid";
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("create", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("delete", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("rename", () => this.scheduleRender()));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 120);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  collectItems() {
    return this.plugin.collectMediaItems(this.config.source || undefined);
  }

  render() {
    AnimeListUI.renderLibrary(this.containerEl, this.collectItems(), {
      openFile: (path) => this.plugin.app.workspace.openLinkText(path, this.sourcePath),
      addItem: (initialType) => this.plugin.openAddModal(initialType),
      editItem: (path) => this.plugin.openEditModal(path),
      toggleFavorite: (path, next) => this.plugin.setFavorite(path, next),
      openTimeline: () => this.plugin.openTimeline(),
      initialView: this.viewMode,
      onViewChange: (view) => {
        this.viewMode = view;
        this.plugin.libraryViewModes?.set(this.sourcePath, view);
      },
    });
  }
}

export class DetailActionsRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.renderTimer = null;
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => {
      if (file?.path === this.sourcePath) this.scheduleRender();
    }));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 80);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  render() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) return;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    this.containerEl.replaceChildren();
    const bar = makeEl("div", "al-detail-actions");
    const summary = makeEl("div", "al-detail-summary");
    const detailItem = {
      status: fm.status || "planned", mediaType: fm.media_type || "anime", releaseStatus: normalizeReleaseStatus(fm.release_status),
      progress: normalizeProgressValue(fm.progress), total: String(fm.media_type || "anime") === "anime" ? normalizeProgressValue(fm.progress_total) : 0, unit: fm.progress_unit || "",
    };
    const status = makeEl("span", `al-status status-${detailItem.status}`, itemStatusLabel(detailItem));
    const unitLabel = LABEL.unit[detailItem.unit] || detailItem.unit || "";
    const hasTotal = detailItem.total !== 0 && detailItem.total !== "";
    const progress = makeEl("span", "", hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0 ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel }) : uiText("detail.noProgress"));
    summary.append(status, progress);
    if (fm.score != null && fm.score !== "") summary.appendChild(makeEl("span", "al-detail-score", `★ ${Number(fm.score).toFixed(1)}`));
    const actions = makeEl("div", "al-detail-buttons");
    const favorite = makeEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`, fm.favorite === true ? uiText("detail.favorite") : uiText("detail.favoriteAdd"));
    favorite.type = "button";
    favorite.addEventListener("click", () => this.plugin.setFavorite(file.path, fm.favorite !== true));
    const edit = makeEl("button", "", uiText("action.edit"));
    edit.type = "button";
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = makeEl("button", "", uiText("detail.library"));
    library.type = "button";
    library.addEventListener("click", () => this.plugin.openLibrary());
    actions.append(favorite, edit, library);
    const urls = asArray(fm.source_urls).filter(Boolean);
    if (urls[0]) {
      const external = makeEl("button");
      external.type = "button";
      appendIconLabel(external, "external", uiText("detail.source"));
      external.addEventListener("click", () => window.open(String(urls[0]), "_blank"));
      actions.appendChild(external);
    }
    const remove = makeEl("button", "al-detail-delete", uiText("action.delete"));
    remove.type = "button";
    remove.addEventListener("click", () => new ConfirmDeleteModal(this.plugin, file, () => this.plugin.openLibrary()).open());
    actions.appendChild(remove);
    bar.append(summary, actions);
    this.containerEl.appendChild(bar);
  }
}

export class LegacyAnimeListPlugin extends Plugin {
  async onload() {
    this.libraryViewModes = new Map();
    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      const child = new AnimeListRenderChild(element, this, context.sourcePath, parseConfig(source));
      context.addChild(child);
    });
    this.registerMarkdownCodeBlockProcessor("animelist-detail", (_source, element, context) => {
      const child = new DetailActionsRenderChild(element, this, context.sourcePath);
      context.addChild(child);
    });
    this.addCommand({ id: "open-library", name: uiText("app.openLibrary"), callback: () => this.app.workspace.openLinkText("Dashboard/Library", "", false) });
    this.addCommand({ id: "add-media", name: uiText("action.collect"), callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: uiText("app.openTimeline"), callback: () => this.openTimeline() });
  }

  openAddModal(initialType = "anime") {
    new AddMediaModal(this, initialType).open();
  }

  openEditModal(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) { new Notice(uiText("notice.mediaNoteMissing")); return; }
    new EditMediaModal(this, file).open();
  }

  openTimeline() {
    new TimelineModal(this, this.collectMediaItems(MEDIA_ROOT)).open();
  }

  getMediaRepository() {
    if (!this.mediaRepository) this.mediaRepository = new MediaRepository(this.app);
    return this.mediaRepository;
  }

  collectMediaItems(source = MEDIA_ROOT) {
    const root = String(source || MEDIA_ROOT).replace(/^\/+|\/+$/g, "");
    return this.getMediaRepository().collect([root]);
  }

  async setFavorite(path, next) {
    await this.getMediaRepository().setFavorite(path, next === true);
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
  }

  async deleteMediaFile(file) {
    await this.app.fileManager.trashFile(file);
  }

  async getTemplates(mediaType) {
    const typeFolder = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    const files = getScopedMarkdownFiles(this.app, [TEMPLATE_ROOT]).filter((file) => {
      if (!file.path.startsWith(`${TEMPLATE_ROOT}/`)) return false;
      const relative = file.path.slice(TEMPLATE_ROOT.length + 1);
      return !relative.includes("/") || relative.startsWith("Common/") || relative.startsWith(`${typeFolder}/`);
    });
    return files.sort((a, b) => a.path.localeCompare(b.path, "zh-Hant")).map((file) => ({
      path: file.path,
      name: file.path.startsWith(`${TEMPLATE_ROOT}/Common/`) ? uiText("common.sharedName", { name: file.basename }) : file.basename,
    }));
  }

  async readTemplate(path) {
    if (!path) return "";
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return "";
    return await this.app.vault.cachedRead(file);
  }

  async searchExternal(mediaType, query) {
    const tasks = [
      this.searchBangumi(mediaType, query).then((items) => ({ provider: "Bangumi", items })).catch((error) => ({ provider: "Bangumi", error })),
      this.searchAniList(mediaType, query).then((items) => ({ provider: "AniList", items })).catch((error) => ({ provider: "AniList", error })),
    ];
    if (mediaType === "novel") tasks.push(this.searchOpenLibrary(query).then((items) => ({ provider: "Open Library", items })).catch((error) => ({ provider: "Open Library", error })));
    const settled = await Promise.all(tasks);
    const warnings = settled.filter((entry) => entry.error).map((entry) => `${entry.provider}: ${entry.error?.message || entry.error}`);
    const all = [];
    settled.forEach((entry) => { if (entry.items) all.push(...entry.items); });
    return { results: dedupeSearchResults(all).slice(0, 24), warnings };
  }

  async searchBangumi(mediaType, query) {
    const response = await requestUrl({
      url: "https://api.bgm.tv/v0/search/subjects?limit=10&offset=0", method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ keyword: query, sort: "match", filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false } }),
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    return asArray(payload.data).map((subject) => normalizeBangumiSubject(subject, mediaType));
  }

  async searchAniList(mediaType, query) {
    const graphQuery = `
      query ($search: String, $type: MediaType, $format: MediaFormat) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
            id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
            startDate { year month day }
            title { romaji english native }
            coverImage { extraLarge large medium }
            studios(isMain: true) { nodes { name } }
            staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
          }
        }
      }`;
    const variables = { search: query, type: mediaType === "anime" ? "ANIME" : "MANGA", format: mediaType === "novel" ? "NOVEL" : null };
    const response = await requestUrl({
      url: "https://graphql.anilist.co", method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ query: graphQuery, variables }),
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    let media = asArray(payload?.data?.Page?.media);
    if (mediaType === "manga") media = media.filter((item) => String(item?.format || "").toUpperCase() !== "NOVEL");
    return media.map((item) => normalizeAniListMedia(item, mediaType));
  }

  async searchOpenLibrary(query) {
    const fields = "key,title,author_name,first_publish_year,cover_i,subject";
    const response = await requestUrl({
      url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=8&lang=zh`,
      method: "GET", headers: { "Accept": "application/json", "User-Agent": USER_AGENT },
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    return asArray(payload.docs).map(normalizeOpenLibraryBook);
  }

  async ensureFolder(path) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try { await this.app.vault.createFolder(current); }
        catch (error) { if (!this.app.vault.getAbstractFileByPath(current)) throw error; }
      }
    }
  }

  findExistingBySource(provider, sourceId) {
    return this.getMediaRepository().findBySource(
      [MEDIA_ROOT],
      String(provider),
      String(sourceId),
    );
  }

  async uniqueFilePath(folder, baseName, extension) {
    const clean = sanitizePathPart(baseName);
    let candidate = normalizePath(`${folder}/${clean}.${extension}`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folder}/${clean} (${index}).${extension}`);
      index += 1;
    }
    return candidate;
  }

  async downloadCover(result) {
    if (!result.coverUrl) return "";
    const response = await requestUrl({
      url: result.coverUrl, method: "GET",
      headers: { "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*", "User-Agent": USER_AGENT },
    });
    const rawHeaders = response.headers || {};
    const contentType = Object.entries(rawHeaders).find(([key]) => key.toLocaleLowerCase() === "content-type")?.[1] || "";
    const extension = /webp/i.test(contentType) ? "webp" : /png/i.test(contentType) ? "png" : /avif/i.test(contentType) ? "avif" : "jpg";
    const folder = normalizePath(`${COVER_ROOT}/${result.mediaType}`);
    await this.ensureFolder(folder);
    const identity = result.sourceId || Date.now();
    const filename = `${slugify(result.title)}-${result.provider}-${identity}`;
    const path = await this.uniqueFilePath(folder, filename, extension);
    await this.app.vault.createBinary(path, response.arrayBuffer);
    return path;
  }

  async createMediaNote(result, form) {
    const title = String(form?.title || "").trim();
    const hasScore = form?.score !== "" && form?.score != null;
    const score = hasScore ? Number(form.score) : null;
    const completedAt = String(form?.completedAt || "").trim();
    if (!title) throw new Error(uiText("validation.titleRequired"));
    if (form?.status === "completed" && !hasScore) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.score")));
    if (hasScore && (score == null || !Number.isFinite(score) || score < 0 || score > 10)) throw new Error(uiText("validation.scoreRange"));
    if (form?.status === "completed" && !completedAt) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.completedAt")));
    const existing = this.findExistingBySource(result.provider, result.sourceId);
    if (existing) {
      new Notice(uiText("notice.existingMedia"));
      await this.app.workspace.openLinkText(existing.path, "", false);
      return existing;
    }
    let coverPath = "";
    if (result.coverUrl) {
      try { coverPath = await this.downloadCover(result); }
      catch (error) {
        console.warn("AnimeList cover download failed; using remote URL", error);
        new Notice(uiText("notice.coverRemote"));
      }
    }
    const folderName = result.mediaType === "anime" ? "Anime" : result.mediaType === "manga" ? "Manga" : "Novel";
    const folder = normalizePath(`${MEDIA_ROOT}/${folderName}`);
    await this.ensureFolder(folder);
    const path = await this.uniqueFilePath(folder, form.title || result.title, "md");
    const templateContent = await this.readTemplate(form.templatePath);
    const markdown = buildMediaMarkdown(result, form, coverPath, templateContent);
    return await this.app.vault.create(path, markdown);
  }
}

export const legacyTest = {
  normalizeBangumiSubject, normalizeAniListMedia, normalizeOpenLibraryBook, dedupeSearchResults,
  buildMediaMarkdown, sanitizePathPart, normalizeGenres, completedProgress, applyTemplateVariables, formatFileModifiedTime,
  ensureDetailBlock, AnimeListUI, TimelineUI, assignTimelineLanes, filterTimelineEntries,
  compareTimelineEntries, normalizeDateParts,
};

export default LegacyAnimeListPlugin;

/* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- End legacy compatibility-layer lint scope. */

import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterRecord, CharacterTier } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { ImageLightboxModal } from "../image-lightbox";
import { bindImageFallback } from "../image-fallback";
import { appendIconLabel, makeEl, setAnimeListIcon } from "../ui-helpers";
import type { WorkspacePageRenderContext } from "../workspace-contracts";
import { CharacterPickerModal } from "./character-picker";
import { CharacterEditModal } from "./character-edit-modal";
import { characterRankingStoreForApp } from "../../data/characters/ranking-store";
import { renderCharacterRanking } from "./character-ranking";
import { ImageGalleryService } from "../../data/image-gallery-service";
import { renderImageGallery, DEFAULT_IMAGE_GALLERY_STATE } from "../image-gallery-renderer";
import { characterRankingItems } from "../../domain/characters/ranking-items";
import { externalImagesForHost, hasDesktopFileBridge } from "../../data/characters/external-image-service";
import { characterText as t } from "../../features/characters/text";

interface CharacterPageState {
  query: string;
  tier: "all" | CharacterTier;
  mode: "library" | "images" | "ranking";
}

const pageStates = new WeakMap<object, CharacterPageState>();
const galleryServices = new WeakMap<object, ImageGalleryService>();
function galleryService(host: AnimeListFeatureHost): ImageGalleryService {
  let service = galleryServices.get(host);
  if (!service) { service = new ImageGalleryService(host); galleryServices.set(host, service); }
  return service;
}
const activeRender = new WeakMap<object, number>();

function pageState(host: AnimeListFeatureHost): CharacterPageState {
  let state = pageStates.get(host);
  if (!state) {
    state = { query: "", tier: "all", mode: "library" };
    pageStates.set(host, state);
  }
  return state;
}
function button(label: string, action: () => void, cls = ""): HTMLButtonElement {
  const el = makeEl("button", cls, label);
  el.type = "button";
  el.addEventListener("click", action);
  return el;
}
function msg(error: unknown): string { return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error"; }

function imageResource(host: AnimeListFeatureHost, image: string, sourcePath: string): string {
  const resolved = imageSectionServiceForHost(host).resolve(image, sourcePath);
  return resolved.thumbnailSources?.src || resolved.resourcePath;
}

function portrait(host: AnimeListFeatureHost, record: CharacterRecord): HTMLElement {
  const wrap = makeEl("div", "al-cover-wrap al-character-cover");
  const src = imageResource(host, record.portrait, record.path);
  if (src) {
    const image = makeEl("img", "al-cover");
    image.alt = record.name;
    image.loading = "lazy";
    image.decoding = "async";
    bindImageFallback(image, () => makeEl("div", "al-cover-missing", t("noPortrait")));
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    wrap.appendChild(image);
    image.src = src;
  } else wrap.appendChild(makeEl("div", "al-cover-missing", t("noPortrait")));
  return wrap;
}

export function openCharacterRanking(host: AnimeListFeatureHost): void {
  pageState(host).mode = "ranking";
  void host.openLibrarySection("characters");
}

export async function renderCharacterPage(
  host: AnimeListFeatureHost, service: CharacterLibraryService,
  container: HTMLElement, context: WorkspacePageRenderContext,
): Promise<void> {
  const state = pageState(host);
  const generation = (activeRender.get(container) ?? 0) + 1;
  activeRender.set(container, generation);
  const isStale = (): boolean => context.signal.aborted
    || activeRender.get(container) !== generation || !container.isConnected;
  const records = await service.list();
  if (hasDesktopFileBridge()) {
    await Promise.allSettled(records.filter(record => /^file:\/\//i.test(record.portrait))
      .map(record => externalImagesForHost(host).prepare(record.portrait)));
  }
  if (isStale()) return;
  const redraw = (): void => {
    void renderCharacterPage(host, service, container, context);
  };
  const toolbar = makeEl("nav", "al-character-mode-tabs al-type-tabs");
  for (const mode of ["library", "images", "ranking"] as const) {
    const tab = button(t(mode === "library" ? "library" : mode === "images" ? "allPictures" : "ranking"), () => {
      state.mode = mode; redraw();
    }, "al-type-tab" + (state.mode === mode ? " is-active" : ""));
    tab.setAttribute("aria-pressed", String(state.mode === mode));
    toolbar.appendChild(tab);
  }
  const root = makeEl("section", "al-character-page");
  root.appendChild(toolbar);
  const add = button("", () => new CharacterPickerModal(host, service).open(), "al-add-button");
  appendIconLabel(add, "plus", t("add"));
  context.pageActions.replaceChildren(add);
  if (state.mode === "ranking") {
    container.replaceChildren(root);
    const content = makeEl("div");
    root.appendChild(content);
    try {
      await renderCharacterRanking(content, host, characterRankingStoreForApp(host.app), records, redraw, path => {
        void service.ensureVisibleWorks(path).then(() => host.openMediaFile(path))
          .catch(error => new Notice(t("failed", { reason: msg(error) })));
      });
    } catch (error) {
      content.replaceChildren(makeEl("p", "al-character-hint", t("failed", { reason: msg(error) })));
    }
    return;
  }
  if (state.mode === "images") {
    container.replaceChildren(root);
    const content = makeEl("div");
    root.appendChild(content);
    const galleryWorks = await galleryService(host).collect(characterRankingItems(records));
    if (isStale()) return;
    if (hasDesktopFileBridge()) {
      const externals = galleryWorks.flatMap(work => work.images.map(image => image.path))
        .filter(path => /^file:\/\//i.test(path));
      await Promise.allSettled(externals.map(path => externalImagesForHost(host).prepare(path)));
    }
    if (isStale()) return;
    const imageService = imageSectionServiceForHost(host);
    renderImageGallery(content, galleryWorks.filter(work => work !== null), {
      ...DEFAULT_IMAGE_GALLERY_STATE, type: "all", mode: "all",
    }, {
      resolve: image => imageService.resolve(image.path, image.sourcePath),
      openLightbox(images, index) {
        new ImageLightboxModal(host.app, imageService, images.map(image => ({
          path: image.path, sourcePath: image.sourcePath,
        })), index).open();
      },
      openSource(path) { void host.openMediaFile(path); },
      hideMediaFilters: true,
      pageTitle: t("allPictures"),
      currentCoverLabel: t("currentPortrait"),
      onSetCover(image) {
        void imageService.setAsCover(image.sourcePath, image.path)
          .then(() => { redraw(); })
          .catch(error => new Notice(t("failed", { reason: msg(error) })));
      },
      isCurrentCover(image) {
        return records.some(record => record.path === image.sourcePath
          && record.portrait === image.path);
      },
    });
    return;
  }
  const filterRoot = makeEl("div");
  const tools = makeEl("div", "al-character-tools al-toolbar");
  const searchBox = makeEl("div", "al-search");
  const searchIcon = makeEl("span", "al-icon");
  setAnimeListIcon(searchIcon, "search");
  const query = makeEl("input");
  query.type = "search";
  query.placeholder = t("search");
  query.setAttribute("aria-label", t("search"));
  query.value = state.query;
  const selectBox = makeEl("div", "al-sort");
  const sortIcon = makeEl("span", "al-icon");
  setAnimeListIcon(sortIcon, "list-filter");
  const tier = makeEl("select");
  tier.setAttribute("aria-label", t("level"));
  for (const key of ["all", "top", "high", "liked"] as const) {
    const option = makeEl("option");
    option.value = key;
    option.textContent = t(key);
    tier.appendChild(option);
  }
  tier.value = state.tier;
  const grid = makeEl("div", "al-character-grid al-grid is-grid");
  const titles = new Map(host.collectMediaItems().map(item => [item.filePath, item.title]));
  const renderCards = (): void => {
    grid.replaceChildren();
    const filtered = records.filter(record => (state.tier === "all" || record.tier === state.tier)
      && record.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
    for (const record of filtered) {
      const card = makeEl("article", "al-card al-character-card");
      card.dataset.path = record.path;
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      const openNote = (): void => {
        void service.ensureVisibleWorks(record.path).then(() => host.openMediaFile(record.path))
          .catch(error => new Notice(t("failed", { reason: msg(error) })));
      };
      card.addEventListener("click", openNote);
      card.addEventListener("keydown", event => {
        // A focused edit button handles its own keyboard activation.
        if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        openNote();
      });
      const cover = portrait(host, record);
      cover.appendChild(makeEl("div", "al-cover-shade"));
      const top = makeEl("div", "al-cover-top");
      if (record.tier !== "liked") top.appendChild(makeEl("span", "al-format-badge", t(record.tier)));
      const topActions = makeEl("div", "al-card-top-actions");
      const details = makeEl("button", "al-edit-button");
      details.type = "button";
      details.title = t("editCharacter");
      details.setAttribute("aria-label", details.title);
      setAnimeListIcon(details, "pencil");
      details.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        new CharacterEditModal(host, service, record, openNote).open();
      });
      topActions.appendChild(details);
      top.appendChild(topActions);
      cover.appendChild(top);
      const body = makeEl("div", "al-card-body");
      body.appendChild(makeEl("h2", "al-card-title", record.name));
      if (record.appearances.length) {
        const workNames = record.appearances.map(path => titles.get(path) ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path);
        const summary = workNames.slice(0, 2).join(" · ")
          + (workNames.length > 2 ? " +" + String(workNames.length - 2) : "");
        const facts = makeEl("div", "al-facts", summary);
        facts.title = workNames.join(" · ");
        body.appendChild(facts);
      }
      card.append(cover, body);
      grid.appendChild(card);
    }
    if (!filtered.length) grid.appendChild(makeEl("p", "al-character-hint",
      records.length ? t("noResults") : t("empty")));
  };
  query.addEventListener("input", () => { state.query = query.value; renderCards(); });
  tier.addEventListener("change", () => { state.tier = tier.value as CharacterPageState["tier"]; renderCards(); });
  searchBox.append(searchIcon, query);
  selectBox.append(sortIcon, tier);
  tools.append(searchBox, selectBox);
  filterRoot.append(tools, grid);
  root.appendChild(filterRoot);
  container.replaceChildren(root);
  renderCards();
}

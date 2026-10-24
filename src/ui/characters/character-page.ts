import { Notice, TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterRecord, CharacterTier } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { findImageSectionBlocks, parseImageSectionSource } from "../../domain/image-section";
import { imageAssetFromFile, imageSectionServiceForHost } from "../../data/image-section-service";
import { ImageLightboxModal } from "../image-lightbox";
import { bindImageFallback } from "../image-fallback";
import { makeEl } from "../ui-helpers";
import type { WorkspacePageRenderContext } from "../workspace-contracts";
import { CharacterPickerModal } from "./character-picker";
import { CharacterRankingStore } from "../../data/characters/ranking-store";
import { renderCharacterRanking } from "./character-ranking";
import { buildImageGalleryWork } from "../../domain/image-gallery";
import { renderImageGallery, DEFAULT_IMAGE_GALLERY_STATE } from "../image-gallery-renderer";
import { characterRankingItems } from "../../domain/characters/ranking-items";
import { externalImageUri } from "../../domain/characters/external-image";
import { externalImagesForHost, hasDesktopFileBridge } from "../../data/characters/external-image-service";
import { characterText as t } from "../../features/characters/text";

interface CharacterPageState {
  query: string;
  tier: "all" | CharacterTier;
  selected: string | null;
  mode: "library" | "images" | "ranking";
}

const pageStates = new WeakMap<object, CharacterPageState>();
const rankingStores = new WeakMap<object, CharacterRankingStore>();
function rankingStore(host: AnimeListFeatureHost): CharacterRankingStore {
  let store = rankingStores.get(host);
  if (!store) { store = new CharacterRankingStore(host.app); rankingStores.set(host, store); }
  return store;
}
function pageState(host: AnimeListFeatureHost): CharacterPageState {
  let state = pageStates.get(host);
  if (!state) {
    state = { query: "", tier: "all", selected: null, mode: "library" };
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
  if (/^https:\/\//i.test(image)) return image;
  if (/^file:\/\//i.test(image)) return externalImagesForHost(host).get(image);
  const file = host.app.metadataCache.getFirstLinkpathDest(image, sourcePath)
    ?? host.app.vault.getAbstractFileByPath(image);
  return file instanceof TFile
    ? host.getImageThumbnailSources(file)?.src || host.app.vault.getResourcePath(file) : "";
}

function portrait(host: AnimeListFeatureHost, record: CharacterRecord): HTMLElement {
  const wrap = makeEl("div", "al-character-cover");
  const src = imageResource(host, record.portrait, record.path);
  if (src) {
    const image = makeEl("img");
    image.alt = record.name;
    image.loading = "lazy";
    image.decoding = "async";
    bindImageFallback(image, () => makeEl("span", "al-character-cover-fallback", "☆"));
    wrap.appendChild(image);
    image.src = src;
  } else wrap.appendChild(makeEl("span", "al-character-cover-fallback", "☆"));
  return wrap;
}

async function renderDetails(
  host: AnimeListFeatureHost,
  service: CharacterLibraryService,
  container: HTMLElement,
  record: CharacterRecord,
  context: WorkspacePageRenderContext,
  redraw: () => void,
): Promise<void> {
  const root = makeEl("div", "al-character-details");
  root.appendChild(button("← " + t("back"), () => {
    pageState(host).selected = null;
    redraw();
  }, "al-secondary-button"));
  const header = makeEl("div", "al-character-profile");
  header.appendChild(portrait(host, record));
  const intro = makeEl("div", "al-character-profile-main");
  intro.appendChild(makeEl("h2", "", record.name));
  const tier = makeEl("select");
  tier.setAttribute("aria-label", t("level"));
  for (const key of ["top", "high", "liked"] as const) {
    const option = makeEl("option");
    option.value = key;
    option.textContent = t(key);
    tier.appendChild(option);
  }
  tier.value = record.tier;
  tier.addEventListener("change", () => {
    void service.setTier(record.path, tier.value as CharacterTier)
      .then(() => host.refreshViews())
      .catch(error => new Notice(t("failed", { reason: msg(error) })));
  });
  intro.appendChild(tier);
  const nameRow = makeEl("div", "al-character-rename-row");
  const name = makeEl("input");
  name.type = "text";
  name.value = record.name;
  name.setAttribute("aria-label", t("displayName"));
  nameRow.append(name, button(t("rename"), () => {
    if (!name.value.trim() || name.value.trim() === record.name) return;
    void service.setName(record.path, name.value).then(() => host.refreshViews())
      .catch(error => new Notice(t("failed", { reason: msg(error) })));
  }));
  intro.appendChild(nameRow);
  intro.appendChild(button(t("open"), () => { void host.openMediaFile(record.path); }));
  header.appendChild(intro);
  root.appendChild(header);
  if (record.appearances.length) {
    root.appendChild(makeEl("h3", "", t("works")));
    const works = makeEl("div", "al-character-work-links");
    const media = new Map(host.collectMediaItems().map(item => [item.filePath, item.title]));
    for (const path of record.appearances) {
      works.appendChild(button(media.get(path) ?? path, () => { void host.openMediaFile(path); }));
    }
    root.appendChild(works);
  }
  root.appendChild(makeEl("h3", "", t("pictures")));
  const file = host.app.vault.getAbstractFileByPath(record.path);
  const markdown = file instanceof TFile ? await host.app.vault.cachedRead(file) : "";
  if (context.signal.aborted) return;
  const blocks = findImageSectionBlocks(markdown);
  const images = [...new Set(blocks.flatMap(block => block.paths))];
  const external = externalImagesForHost(host);
  if (hasDesktopFileBridge()) {
    await Promise.allSettled(images.filter(path => /^file:\/\//i.test(path)).map(path => external.prepare(path)));
  }
  const gallery = makeEl("div", "al-character-images");
  const imageService = imageSectionServiceForHost(host);
  for (const [index, path] of images.entries()) {
    const resolved = imageService.resolve(path, record.path);
    const src = resolved.thumbnailSources?.src || resolved.resourcePath;
    const thumb = makeEl("div", "al-character-image");
    if (src) {
      const open = button("", () => {
        new ImageLightboxModal(host.app, imageService,
          images.map(value => ({ path: value, sourcePath: record.path })), index).open();
      }, "al-character-image-open");
      const image = makeEl("img");
      image.alt = record.name;
      image.loading = "lazy";
      bindImageFallback(image, () => makeEl("span", "al-character-cover-fallback", "☆"));
      open.appendChild(image);
      image.src = src;
      thumb.appendChild(open);
      thumb.appendChild(button(t("portrait"), () => {
        void service.setPortrait(record.path, path).then(() => host.refreshViews())
          .catch(error => new Notice(t("failed", { reason: msg(error) })));
      }, "al-character-image-select"));
    } else thumb.appendChild(makeEl("span", "", path));
    gallery.appendChild(thumb);
  }
  if (images.length) root.appendChild(gallery);
  else root.appendChild(makeEl("p", "al-character-hint", t("noPictures")));
  const addRow = makeEl("div", "al-character-photo-actions");
  const upload = makeEl("input");
  upload.type = "file";
  upload.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
  upload.multiple = true;
  upload.hidden = true;
  upload.addEventListener("change", () => {
    const files = Array.from(upload.files ?? []);
    if (!files.length) return;
    const location = blocks[0];
    if (!location) return;
    upload.disabled = true;
    void Promise.all(files.map(file => imageAssetFromFile(file))).then(async assets => {
      const result = await imageService.addAssets(record.path, location, assets);
      const added = parseImageSectionSource(result.source);
      if (!record.portrait && added.length) await service.setPortrait(record.path, added[0]);
      host.refreshViews();
    }).catch(error => new Notice(t("failed", { reason: msg(error) })))
      .finally(() => { upload.disabled = false; upload.value = ""; });
  });
  addRow.append(
    button(t("addPictures"), () => upload.click(), "mod-cta"),
    upload,
    makeEl("small", "", t("pictureHelp")),
  );
  if (hasDesktopFileBridge()) {
    const link = makeEl("input");
    link.type = "text";
    link.placeholder = t("externalPath");
    link.setAttribute("aria-label", t("externalPath"));
    addRow.append(link, button(t("linkExternal"), () => {
      let uri: string;
      try { uri = externalImageUri(link.value); }
      catch (error) { new Notice(t("failed", { reason: msg(error) })); return; }
      void external.prepare(uri).then(async () => {
        await service.attachImage(record.path, uri);
        host.refreshViews();
      }).catch(error => new Notice(t("failed", { reason: msg(error) })));
    }));
  } else if (images.some(path => /^file:\/\//i.test(path))) {
    addRow.appendChild(makeEl("small", "", t("desktopOnly")));
  }
  root.appendChild(addRow);
  container.replaceChildren(root);
}

export function openCharacterRanking(host: AnimeListFeatureHost): void {
  pageState(host).mode = "ranking";
  pageState(host).selected = null;
  void host.openLibrarySection("characters");
}

export async function renderCharacterPage(
  host: AnimeListFeatureHost, service: CharacterLibraryService,
  container: HTMLElement, context: WorkspacePageRenderContext,
): Promise<void> {
  const state = pageState(host);
  const records = await service.list();
  if (hasDesktopFileBridge()) {
    await Promise.allSettled(records.filter(record => /^file:\/\//i.test(record.portrait))
      .map(record => externalImagesForHost(host).prepare(record.portrait)));
  }
  if (context.signal.aborted || !container.isConnected) return;
  const redraw = (): void => {
    void renderCharacterPage(host, service, container, context);
  };
  const selected = records.find(item => item.path === state.selected);
  if (selected) {
    await renderDetails(host, service, container, selected, context, redraw);
    return;
  }
  if (state.selected) state.selected = null;
  const toolbar = makeEl("div", "al-character-mode-tabs");
  for (const mode of ["library", "images", "ranking"] as const) {
    const tab = button(t(mode === "library" ? "title" : mode === "images" ? "allPictures" : "ranking"), () => {
      state.mode = mode; redraw();
    }, state.mode === mode ? "is-active" : "");
    tab.setAttribute("aria-pressed", String(state.mode === mode));
    toolbar.appendChild(tab);
  }
  const root = makeEl("section", "al-character-page");
  root.appendChild(toolbar);
  const add = button(t("add"), () => new CharacterPickerModal(host, service).open(), "mod-cta");
  context.pageActions.replaceChildren(add);
  if (state.mode === "ranking") {
    container.replaceChildren(root);
    const content = makeEl("div");
    root.appendChild(content);
    await renderCharacterRanking(content, host, rankingStore(host), records, redraw, path => {
      state.selected = path; redraw();
    });
    return;
  }
  if (state.mode === "images") {
    container.replaceChildren(root);
    const content = makeEl("div");
    root.appendChild(content);
    const galleryWorks = await Promise.all(records.map(async record => {
      const file = host.app.vault.getAbstractFileByPath(record.path);
      if (!(file instanceof TFile)) return null;
      const markdown = await host.app.vault.cachedRead(file);
      if (hasDesktopFileBridge()) {
        const external = findImageSectionBlocks(markdown).flatMap(block => block.paths)
          .filter(path => /^file:\/\//i.test(path));
        await Promise.allSettled(external.map(path => externalImagesForHost(host).prepare(path)));
      }
      const eligible = characterRankingItems([record])[0];
      return buildImageGalleryWork(eligible, markdown);
    }));
    if (context.signal.aborted || !container.isConnected) return;
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
    });
    return;
  }
  const filterRoot = makeEl("div");
  const tools = makeEl("div", "al-character-tools");
  const query = makeEl("input");
  query.type = "search";
  query.placeholder = t("search");
  query.setAttribute("aria-label", t("search"));
  query.value = state.query;
  const tier = makeEl("select");
  tier.setAttribute("aria-label", t("level"));
  for (const key of ["all", "top", "high", "liked"] as const) {
    const option = makeEl("option");
    option.value = key;
    option.textContent = t(key);
    tier.appendChild(option);
  }
  tier.value = state.tier;
  const grid = makeEl("div", "al-character-grid");
  const renderCards = (): void => {
    grid.replaceChildren();
    const filtered = records.filter(record => (state.tier === "all" || record.tier === state.tier)
      && record.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
    for (const record of filtered) {
      const card = button("", () => { state.selected = record.path; redraw(); }, "al-character-card");
      card.append(portrait(host, record), makeEl("span", "al-character-name", record.name));
      card.appendChild(makeEl("span", "al-character-tier-label", t(record.tier)));
      grid.appendChild(card);
    }
    if (!filtered.length) grid.appendChild(makeEl("p", "al-character-hint",
      records.length ? t("noResults") : t("empty")));
  };
  query.addEventListener("input", () => { state.query = query.value; renderCards(); });
  tier.addEventListener("change", () => { state.tier = tier.value as CharacterPageState["tier"]; renderCards(); });
  tools.append(query, tier);
  filterRoot.append(tools, grid);
  root.appendChild(filterRoot);
  container.replaceChildren(root);
  renderCards();
}

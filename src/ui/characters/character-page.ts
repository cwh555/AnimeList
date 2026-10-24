import { Notice, TFile } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import type { CharacterRecord, CharacterTier } from "../../domain/characters/character";
import type { CharacterLibraryService } from "../../data/character-library-service";
import { findImageSectionBlocks, parseImageSectionSource } from "../../domain/image-section";
import { imageAssetFromFile, imageSectionServiceForHost } from "../../data/image-section-service";
import { ImageLightboxModal } from "../image-lightbox";
import { makeEl } from "../ui-helpers";
import type { WorkspacePageRenderContext } from "../workspace-contracts";
import { CharacterPickerModal } from "./character-picker";
import { characterText as t } from "../../features/characters/text";

interface CharacterPageState {
  query: string;
  tier: "all" | CharacterTier;
  selected: string | null;
}

const pageStates = new WeakMap<object, CharacterPageState>();
function pageState(host: AnimeListFeatureHost): CharacterPageState {
  let state = pageStates.get(host);
  if (!state) {
    state = { query: "", tier: "all", selected: null };
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
  const file = host.app.metadataCache.getFirstLinkpathDest(image, sourcePath)
    ?? host.app.vault.getAbstractFileByPath(image);
  return file instanceof TFile ? host.app.vault.getResourcePath(file) : "";
}

function portrait(host: AnimeListFeatureHost, record: CharacterRecord): HTMLElement {
  const wrap = makeEl("div", "al-character-cover");
  const src = imageResource(host, record.portrait, record.path);
  if (src) {
    const image = makeEl("img");
    image.src = src;
    image.alt = record.name;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      wrap.appendChild(makeEl("span", "al-character-cover-fallback", "☆"));
    }, { once: true });
    wrap.appendChild(image);
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
  const gallery = makeEl("div", "al-character-images");
  const imageService = imageSectionServiceForHost(host);
  for (const [index, path] of images.entries()) {
    const src = imageService.resolve(path, record.path).resourcePath;
    const thumb = makeEl("div", "al-character-image");
    if (src) {
      const open = button("", () => {
        new ImageLightboxModal(host.app, imageService,
          images.map(value => ({ path: value, sourcePath: record.path })), index).open();
      }, "al-character-image-open");
      const image = makeEl("img");
      image.src = src;
      image.alt = record.name;
      image.loading = "lazy";
      open.appendChild(image);
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
  root.appendChild(addRow);
  container.replaceChildren(root);
}

export async function renderCharacterPage(
  host: AnimeListFeatureHost, service: CharacterLibraryService,
  container: HTMLElement, context: WorkspacePageRenderContext,
): Promise<void> {
  const state = pageState(host);
  const records = await service.list();
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
  const root = makeEl("section", "al-character-page");
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
  root.append(tools, grid);
  const add = button(t("add"), () => new CharacterPickerModal(host, service).open(), "mod-cta");
  context.pageActions.replaceChildren(add);
  container.replaceChildren(root);
  renderCards();
}

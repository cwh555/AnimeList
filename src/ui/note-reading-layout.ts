import type { TFile } from "obsidian";
import type { AnimeListUiHost } from "./plugin-host";
import { bindImageFallback } from "./image-fallback";
import { makeEl, setAnimeListIcon } from "./ui-helpers";
import { uiText } from "../ui-text";

export const READING_NOTE_MIN_WIDTH = 1100;
const mountedReadingViews = new WeakMap<HTMLElement, { owner: HTMLElement; layout: ReadingNoteLayout }>();

export interface ReadingNotePresentation {
  readonly title: string;
  readonly originalTitle: string;
  readonly coverResource: string;
  readonly mediaType: "anime" | "manga" | "novel";
  readonly format: string;
  readonly year: string;
  readonly people: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly progress: string;
  readonly score: string;
  readonly quarter: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly favorite: boolean;
}

export interface ReadingNoteLayout {
  update(presentation: ReadingNotePresentation): void;
  dispose(): void;
}

function textRow(parent: HTMLElement, title: string, value: string): void {
  if (!value) return;
  const row = makeEl("div", "al-reading-note-meta-row");
  row.append(makeEl("dt", "", title), makeEl("dd", "", value));
  parent.append(row);
}

function infoCard(title: string, value: string, className = ""): HTMLElement {
  const card = makeEl("section", `al-reading-note-info ${className}`.trim());
  card.append(makeEl("span", "al-reading-note-info-label", title));
  card.append(makeEl("strong", "al-reading-note-info-value", value));
  return card;
}

function actionButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const button = makeEl("button", "al-reading-note-action");
  button.type = "button";
  appendIconLabelSafe(button, icon, label);
  button.addEventListener("click", onClick);
  return button;
}

function appendIconLabelSafe(button: HTMLElement, icon: string, label: string): void {
  const visual = makeEl("span", "al-reading-note-action-icon");
  setAnimeListIcon(visual, icon);
  button.append(visual, makeEl("span", "", label));
}

function isEmbedded(element: HTMLElement): boolean {
  return element.closest(".markdown-embed, .internal-embed, .embed-container") !== null;
}

/**
 * Mount side rails alongside—not around or inside—Obsidian-owned Markdown.
 * The original Markdown sizer and all of its children stay in place.
 * Only full-size, nonembedded Reading View notes opt in.
 */
export function installReadingNoteLayout(
  detailContainer: HTMLElement,
  file: TFile,
  plugin: Pick<AnimeListUiHost, "openEditModal" | "setFavorite" | "openLibrary">,
): ReadingNoteLayout | null {
  if (isEmbedded(detailContainer)) return null;
  const preview = detailContainer.closest<HTMLElement>(".markdown-preview-view");
  // Depending on the Obsidian version, the reading surface can be inside a
  // markdown leaf without a separate .markdown-reading-view ancestor.
  if (!preview || (!preview.closest(".markdown-reading-view")
    && !preview.closest('.workspace-leaf-content[data-type="markdown"]'))) return null;
  const active = mountedReadingViews.get(preview);
  if (active?.owner === detailContainer) return null;
  active?.layout.dispose();
  // Some Obsidian builds wrap the sizer. Scope the search to the sizer that
  // actually owns this block rather than assuming it is a direct child.
  const sizer = detailContainer.closest<HTMLElement>(".markdown-preview-sizer");
  if (!sizer || !preview.contains(sizer) || sizer.closest(".markdown-preview-view") !== preview) return null;

  const original = detailContainer.closest<HTMLElement>(".el-pre")
    ?? detailContainer.closest<HTMLElement>(".block-language-animelist-detail")
    ?? detailContainer;
  const document = detailContainer.ownerDocument;
  const rails = makeEl("div", "al-reading-note-rails");
  const left = makeEl("aside", "al-reading-note-rail al-reading-note-rail-left");
  const right = makeEl("aside", "al-reading-note-rail al-reading-note-rail-right");
  rails.append(left, right);
  preview.insertBefore(rails, sizer.parentElement === preview ? sizer : preview.firstChild);
  sizer.classList.add("al-reading-note-sizer");
  original.classList.add("al-reading-note-original");

  let disposed = false;
  let visible = false;
  let presentation: ReadingNotePresentation | null = null;

  const redraw = (): void => {
    if (!presentation || disposed) return;
    const data = presentation;
    left.replaceChildren();
    right.replaceChildren();

    const cover = makeEl("div", "al-reading-note-cover");
    if (data.coverResource) {
      const image = makeEl("img");
      image.alt = uiText("library.coverAlt", { title: data.title });
      image.loading = "lazy";
      image.decoding = "async";
      bindImageFallback(image, () => {
        const missing = makeEl("div", "al-reading-note-no-cover");
        setAnimeListIcon(missing, "book");
        return missing;
      });
      cover.appendChild(image);
      image.src = data.coverResource;
    } else {
      const missing = makeEl("div", "al-reading-note-no-cover");
      setAnimeListIcon(missing, "book");
      cover.appendChild(missing);
    }
    const label = makeEl("div", "al-reading-note-title");
    label.append(makeEl("h2", "", data.title));
    if (data.originalTitle && data.originalTitle !== data.title) {
      label.append(makeEl("p", "", data.originalTitle));
    }
    const facts = makeEl("dl", "al-reading-note-metadata");
    textRow(facts, uiText("detail.format"), data.format);
    textRow(facts, uiText("detail.year"), data.year);
    textRow(facts, uiText(data.mediaType === "anime" ? "detail.studio" : "detail.authors"), data.people);
    if (data.quarter) textRow(facts, uiText("add.metadataSeason"), data.quarter);
    left.append(cover, label, facts);
    if (data.sourceUrl) {
      const source = makeEl("a", "al-reading-note-source", data.sourceLabel || uiText("detail.source"));
      source.href = data.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      left.append(source);
    }

    const status = infoCard(uiText("add.statusLabel"), data.statusLabel, `status-${data.status}`);
    const progress = infoCard(
      uiText(data.mediaType === "anime" ? "add.progressAnime" : data.mediaType === "manga" ? "add.progressManga" : "add.progressNovel"),
      data.progress,
      "al-reading-note-progress",
    );
    right.append(status, progress);
    if (data.score) right.append(infoCard(uiText("field.score"), data.score, "al-reading-note-score"));
    const actions = makeEl("div", "al-reading-note-actions");
    const edit = actionButton(uiText("action.edit"), "pencil", () => plugin.openEditModal(file.path));
    edit.classList.add("is-primary");
    const favorite = actionButton(
      data.favorite ? uiText("detail.favorite") : uiText("detail.favoriteAdd"),
      "star",
      () => { void plugin.setFavorite(file.path, !data.favorite); },
    );
    favorite.setAttribute("aria-pressed", String(data.favorite));
    const library = actionButton(uiText("detail.library"), "library", () => { void plugin.openLibrary(); });
    actions.append(edit, favorite, library);
    right.append(actions);
  };

  const resize = (): void => {
    if (disposed) return;
    const width = preview.clientWidth;
    const mobile = document.body?.classList.contains("is-mobile")
      || preview.closest(".is-mobile") !== null;
    const next = width >= READING_NOTE_MIN_WIDTH && !mobile && sizer.isConnected && rails.isConnected;
    if (next === visible) return;
    visible = next;
    preview.classList.toggle("al-reading-note-wide", next);
    rails.setAttribute("aria-hidden", String(!next));
  };

  const ViewResizeObserver = document.defaultView?.ResizeObserver;
  const observer = ViewResizeObserver ? new ViewResizeObserver(resize) : null;
  observer?.observe(preview);
  document.defaultView?.addEventListener("resize", resize);
  resize();

  const layout: ReadingNoteLayout = {
    update(data) {
      if (disposed) return;
      presentation = data;
      redraw();
      resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      document.defaultView?.removeEventListener("resize", resize);
      preview.classList.remove("al-reading-note-wide");
      original.classList.remove("al-reading-note-original");
      sizer.classList.remove("al-reading-note-sizer");
      rails.remove();
      if (mountedReadingViews.get(preview)?.owner === detailContainer) {
        mountedReadingViews.delete(preview);
      }
    },
  };
  mountedReadingViews.set(preview, { owner: detailContainer, layout });
  return layout;
}

/**
 * MarkdownRenderChild.onload may fire before Obsidian attaches its rendered
 * section to the Reading View. Delay mounting until the host has a parent;
 * keep this controller stable across metadata refreshes and cancel on unload.
 * A bounded retry also covers async Reading View section insertion.
 */
export function mountReadingNoteLayoutWhenReady(
  detailContainer: HTMLElement,
  file: TFile,
  plugin: Pick<AnimeListUiHost, "openEditModal" | "setFavorite" | "openLibrary">,
): ReadingNoteLayout {
  let mounted: ReadingNoteLayout | null = null;
  let current: ReadingNotePresentation | null = null;
  let disposed = false;
  let timer: number | null = null;
  let attempts = 0;

  const tryMount = (): void => {
    timer = null;
    if (disposed || mounted) return;
    if (detailContainer.closest(".markdown-source-view")) return;
    if (detailContainer.isConnected) {
      mounted = installReadingNoteLayout(detailContainer, file, plugin);
      if (mounted && current) mounted.update(current);
    }
    if (!mounted && ++attempts < 8) {
      timer = detailContainer.ownerDocument.defaultView?.setTimeout(tryMount, 75) ?? null;
    }
  };

  // Avoid examining the DOM synchronously: Obsidian may still be assembling
  // its Markdown section at the moment the code block processor is loaded.
  timer = detailContainer.ownerDocument.defaultView?.setTimeout(tryMount, 0) ?? null;
  return {
    update(data) {
      if (disposed) return;
      current = data;
      mounted?.update(data);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) detailContainer.ownerDocument.defaultView?.clearTimeout(timer);
      mounted?.dispose();
      mounted = null;
    },
  };
}

import { MarkdownRenderChild, Menu, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { ImageSectionService } from "../data/image-section-service";
import type { MomentsService } from "../data/moments-service";
import { parseMomentsSource, type MomentItem, type MomentsLocator } from "../domain/moments";
import { momentsText } from "../features/moments/text";
import { copyImageToClipboard, copyImagesToClipboard, copyTextToClipboard } from "./image-clipboard";
import { ImageLightboxModal } from "./image-lightbox";
import { DeleteMomentModal, MomentEditorModal } from "./moments-modal";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

function targetElement(event: Event): Element | null {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return target && typeof target.closest === "function" ? target as Element : null;
}

function interactive(target: Element | null): boolean {
  return Boolean(target?.closest("button, a, input, textarea, select, [role='button']"));
}

export class MomentsRenderChild extends MarkdownRenderChild {
  private source: string;
  private lineHint: number | undefined;
  private scrollerObservers: ResizeObserver[] = [];
  private readonly expandedTextIds = new Set<string>();

  constructor(
    containerEl: HTMLElement,
    private readonly host: AnimeListFeatureHost,
    private readonly momentsService: MomentsService,
    private readonly imageService: ImageSectionService,
    source: string,
    private readonly context: MarkdownPostProcessorContext,
  ) {
    super(containerEl);
    this.source = source;
  }

  onload(): void {
    this.lineHint = this.context.getSectionInfo(this.containerEl)?.lineStart;
    this.containerEl.addEventListener("mousedown", (event) => {
      if (!interactive(targetElement(event))) return;
      event.preventDefault();
      event.stopPropagation();
    });
    this.render();
  }

  onunload(): void {
    this.clearScrollerObservers();
  }

  private clearScrollerObservers(): void {
    this.scrollerObservers.forEach((observer) => observer.disconnect());
    this.scrollerObservers = [];
  }

  private locator(): MomentsLocator {
    const section = this.context.getSectionInfo(this.containerEl);
    return {
      source: this.source,
      lineStart: section?.lineStart ?? this.lineHint,
      lineEnd: section?.lineEnd,
    };
  }

  private setSource(source: string): void {
    this.source = source;
    this.render();
  }

  private openAdd(): void {
    new MomentEditorModal(this.host.app, this.imageService, this.context.sourcePath, null, async (input) => {
      const result = await this.momentsService.addMoment(this.context.sourcePath, this.locator(), input);
      if (result.duplicatesSkipped) new Notice(momentsText("duplicatesSkipped", { count: result.duplicatesSkipped }));
      this.setSource(result.source);
    }).open();
  }

  private openEdit(moment: MomentItem): void {
    new MomentEditorModal(this.host.app, this.imageService, this.context.sourcePath, moment, async (input) => {
      const result = await this.momentsService.editMoment(this.context.sourcePath, this.locator(), moment.id, input);
      if (result.duplicatesSkipped) new Notice(momentsText("duplicatesSkipped", { count: result.duplicatesSkipped }));
      this.setSource(result.source);
    }).open();
  }

  private deleteMoment(moment: MomentItem): void {
    new DeleteMomentModal(this.host.app, async () => {
      const source = await this.momentsService.deleteMoment(this.context.sourcePath, this.locator(), moment.id);
      this.setSource(source);
    }).open();
  }

  private async copyText(moment: MomentItem): Promise<void> {
    try {
      await copyTextToClipboard(moment.text);
      new Notice(momentsText("copiedText"));
    } catch (error) {
      new Notice(momentsText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async copyImages(moment: MomentItem): Promise<void> {
    try {
      await copyImagesToClipboard(this.imageService, this.context.sourcePath, moment.images);
      new Notice(momentsText("copiedImages"));
    } catch (error) {
      new Notice(momentsText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private showMomentMenu(event: MouseEvent, moment: MomentItem): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(() => this.openEdit(moment)));
    menu.addItem((item) => item.setTitle("Copy text").setIcon("copy").onClick(() => void this.copyText(moment)));
    menu.addItem((item) => item.setTitle("Copy images").setIcon("images").onClick(() => void this.copyImages(moment)));
    menu.addItem((item) => item.setTitle("Delete").setIcon("trash").setWarning(true).onClick(() => this.deleteMoment(moment)));
    menu.showAtMouseEvent(event);
  }

  private showImageMenu(event: MouseEvent, path: string): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Copy image").setIcon("copy").onClick(() => {
      void copyImageToClipboard(this.imageService, this.context.sourcePath, path)
        .then(() => new Notice(momentsText("copiedImages")))
        .catch((error) => new Notice(momentsText("copyFailed", { error: errorMessage(error) })));
    }));
    menu.showAtMouseEvent(event);
  }

  private openLightbox(moment: MomentItem, path: string): void {
    const index = Math.max(0, moment.images.indexOf(path));
    new ImageLightboxModal(this.host.app, this.imageService, this.context.sourcePath, moment.images, index).open();
  }

  private bindScroller(
    media: HTMLElement,
    row: HTMLElement,
    previous: HTMLButtonElement,
    next: HTMLButtonElement,
  ): void {
    const sync = (): void => {
      const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
      const scrollable = maxScroll > 2;
      const atStart = !scrollable || row.scrollLeft <= 2;
      const atEnd = !scrollable || row.scrollLeft >= maxScroll - 2;
      media.classList.toggle("is-scrollable", scrollable);
      media.classList.toggle("is-at-start", atStart);
      media.classList.toggle("is-at-end", atEnd);
      previous.hidden = !scrollable;
      next.hidden = !scrollable;
      previous.disabled = atStart;
      next.disabled = atEnd;
    };
    const move = (direction: -1 | 1): void => {
      row.scrollBy({
        left: direction * Math.max(220, row.clientWidth * 0.72),
        behavior: "smooth",
      });
    };
    previous.addEventListener("click", (event) => {
      event.stopPropagation();
      move(-1);
    });
    next.addEventListener("click", (event) => {
      event.stopPropagation();
      move(1);
    });
    row.addEventListener("scroll", sync, { passive: true });
    row.querySelectorAll("img").forEach((image) => image.addEventListener("load", sync, { once: true }));
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(sync);
      observer.observe(row);
      this.scrollerObservers.push(observer);
    }
    window.requestAnimationFrame(sync);
  }

  private metaRow(label: string, value: string): HTMLElement {
    const row = makeEl("div", "al-moment-meta-row");
    row.append(
      makeEl("span", "al-moment-meta-label", `${label}：`),
      makeEl("span", "al-moment-meta-value", value),
    );
    return row;
  }

  private renderQuote(
    moment: MomentItem,
    onExpandedChange: (expanded: boolean) => void,
  ): {
    element: HTMLElement;
    setExternalOverflow: (overflow: boolean) => void;
  } {
    const quote = makeEl("div", "al-moment-quote");
    const text = makeEl("div", "al-moment-text", moment.text);
    const toggle = makeEl("button", "al-moment-text-toggle");
    toggle.type = "button";
    toggle.hidden = true;

    let textOverflow = false;
    let externalOverflow = false;

    const refresh = (): void => {
      const expanded = this.expandedTextIds.has(moment.id);
      quote.classList.toggle("is-expanded", expanded);
      quote.classList.toggle("is-clampable", textOverflow);
      toggle.hidden = !(expanded || textOverflow || externalOverflow);
      toggle.textContent = momentsText(expanded ? "collapseText" : "expandText");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    };

    const setExpanded = (expanded: boolean): void => {
      if (expanded) this.expandedTextIds.add(moment.id);
      else this.expandedTextIds.delete(moment.id);
      refresh();
      onExpandedChange(expanded);
      if (!expanded) window.requestAnimationFrame(syncOverflow);
    };

    const syncOverflow = (): void => {
      if (this.expandedTextIds.has(moment.id)) {
        refresh();
        return;
      }
      textOverflow = text.scrollHeight > text.clientHeight + 2;
      refresh();
    };

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setExpanded(!this.expandedTextIds.has(moment.id));
    });
    quote.append(text, toggle);
    refresh();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(syncOverflow);
      observer.observe(text);
      this.scrollerObservers.push(observer);
    }
    window.requestAnimationFrame(syncOverflow);

    return {
      element: quote,
      setExternalOverflow: (overflow: boolean): void => {
        externalOverflow = overflow;
        refresh();
      },
    };
  }

  private renderMeta(moment: MomentItem): HTMLElement | null {
    const hasMeta = Boolean(moment.source || moment.position || moment.speaker || moment.tags?.length || moment.note);
    if (!hasMeta) return null;

    const section = makeEl("div", "al-moment-meta-section");
    if (moment.source || moment.position || moment.speaker) {
      const meta = makeEl("div", "al-moment-meta");
      if (moment.source) meta.appendChild(this.metaRow(momentsText("sourceLabel"), moment.source));
      if (moment.position) meta.appendChild(this.metaRow(momentsText("positionLabel"), moment.position));
      if (moment.speaker) meta.appendChild(this.metaRow(momentsText("speakerLabel"), moment.speaker));
      section.appendChild(meta);
    }

    if (moment.tags?.length) {
      const row = makeEl("div", "al-moment-meta-row al-moment-tags-row");
      row.appendChild(makeEl("span", "al-moment-meta-label", `${momentsText("tagsLabel")}：`));
      const tags = makeEl("div", "al-moment-tags");
      moment.tags.forEach((tag) => tags.appendChild(makeEl("span", "al-moment-tag", tag)));
      row.appendChild(tags);
      section.appendChild(row);
    }

    if (moment.note) {
      const note = makeEl("div", "al-moment-note");
      note.append(
        makeEl("span", "al-moment-meta-label", `${momentsText("noteLabel")}：`),
        makeEl("div", "al-moment-note-text", moment.note),
      );
      section.appendChild(note);
    }
    return section;
  }

  private renderMoment(moment: MomentItem): HTMLElement {
    const card = makeEl("article", "al-moment-card");
    card.dataset.momentId = moment.id;
    card.dataset.imageCount = String(moment.images.length);

    const actions = makeEl("button", "al-moment-actions");
    actions.type = "button";
    actions.setAttribute("aria-label", "Moment actions");
    actions.textContent = "⋯";
    actions.addEventListener("click", (event) => {
      event.stopPropagation();
      this.showMomentMenu(event, moment);
    });

    const media = makeEl("div", "al-moment-media");
    media.classList.toggle("is-featured", moment.images.length === 1);
    media.classList.toggle("is-filmstrip", moment.images.length > 1);
    const viewport = makeEl("div", "al-moment-image-viewport");
    const row = makeEl("div", "al-moment-image-row");
    row.setAttribute("role", "list");
    row.dataset.imageCount = String(moment.images.length);
    for (const path of moment.images) {
      const frame = makeEl("button", "al-moment-image");
      frame.type = "button";
      frame.setAttribute("role", "listitem");
      frame.setAttribute("aria-label", "Open image");
      const resolved = this.imageService.resolve(path, this.context.sourcePath);
      if (resolved.resourcePath) {
        const image = makeEl("img");
        image.src = resolved.thumbnailSources?.src || resolved.resourcePath;
        if (resolved.thumbnailSources?.srcset) {
          image.srcset = resolved.thumbnailSources.srcset;
          image.sizes = moment.images.length === 1 ? "720px" : "360px";
        }
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.draggable = false;
        const updateRatio = (): void => {
          if (!image.naturalWidth || !image.naturalHeight) return;
          const ratio = Math.min(2.2, Math.max(0.55, image.naturalWidth / image.naturalHeight));
          frame.style.setProperty("--al-moment-image-ratio", String(ratio));
        };
        image.addEventListener("load", updateRatio, { once: true });
        if (image.complete) updateRatio();
        frame.appendChild(image);
      } else {
        const missing = makeEl("div", "al-moment-image-missing");
        setAnimeListIcon(missing, "image-off");
        missing.appendChild(makeEl("span", "", momentsText("missingImage")));
        frame.appendChild(missing);
      }
      frame.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openLightbox(moment, path);
      });
      frame.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showImageMenu(event, path);
      });
      row.appendChild(frame);
    }
    viewport.appendChild(row);

    const previous = makeEl("button", "al-moment-scroll-prev");
    previous.classList.add("al-moment-scroll-nav");
    previous.type = "button";
    previous.hidden = true;
    previous.setAttribute("aria-label", "Previous images");
    setAnimeListIcon(previous, "chevron-left");

    const next = makeEl("button", "al-moment-scroll-next");
    next.classList.add("al-moment-scroll-nav");
    next.type = "button";
    next.hidden = true;
    next.setAttribute("aria-label", "Next images");
    setAnimeListIcon(next, "chevron-right");

    media.append(viewport, previous, next);

    const content = makeEl("div", "al-moment-content");
    const metadata = this.renderMeta(moment);
    const quotePanel = makeEl("div", "al-moment-quote-panel");
    let syncMetadataForExpansion = (_expanded: boolean): void => {};
    const quoteView = this.renderQuote(moment, (expanded) => syncMetadataForExpansion(expanded));
    quotePanel.appendChild(quoteView.element);
    if (metadata) {
      content.addClass("has-metadata");
      content.append(metadata, quotePanel);

      const syncMetadata = (expanded = this.expandedTextIds.has(moment.id)): void => {
        metadata.classList.remove("is-clamped");
        metadata.style.removeProperty("max-height");
        card.classList.toggle("is-text-expanded", expanded);
        if (expanded) return;

        quoteView.setExternalOverflow(false);
        const naturalHeight = metadata.scrollHeight;
        const quoteHeight = quotePanel.getBoundingClientRect().height;
        // Small metadata overages are allowed to grow naturally. Larger note blocks
        // share the quote's Expand / Collapse control instead of introducing a second toggle.
        const needsSharedExpansion = naturalHeight > quoteHeight + 34;
        quoteView.setExternalOverflow(needsSharedExpansion);
        if (!needsSharedExpansion) return;

        const clampedHeight = Math.max(88, quotePanel.getBoundingClientRect().height);
        metadata.classList.add("is-clamped");
        metadata.style.maxHeight = `${clampedHeight}px`;
      };

      syncMetadataForExpansion = syncMetadata;
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => syncMetadata());
        observer.observe(quotePanel);
        this.scrollerObservers.push(observer);
      }
      window.requestAnimationFrame(() => syncMetadata());
    } else {
      content.addClass("without-metadata");
      content.appendChild(quotePanel);
    }

    card.append(media, content, actions);
    this.bindScroller(media, row, previous, next);
    return card;
  }

  private render(): void {
    this.clearScrollerObservers();
    this.containerEl.replaceChildren();
    this.containerEl.addClass("animelist-moments-section");

    const moments = parseMomentsSource(this.source);
    const toolbar = makeEl("div", "al-moments-toolbar");
    const identity = makeEl("div", "al-moments-identity");
    const identityIcon = makeEl("span", "al-moments-icon");
    setAnimeListIcon(identityIcon, "clapperboard");
    identity.append(
      identityIcon,
      makeEl("span", "al-moments-title", "Moments"),
      makeEl("span", "al-moments-count", moments.length),
    );
    const add = makeEl("button", "al-moments-add");
    add.type = "button";
    add.setAttribute("aria-label", momentsText("addMoment"));
    setAnimeListIcon(add, "plus");
    add.addEventListener("click", (event) => { event.stopPropagation(); this.openAdd(); });
    toolbar.append(identity, add);
    this.containerEl.appendChild(toolbar);
    if (!moments.length) {
      this.containerEl.appendChild(makeEl("div", "al-moments-empty", momentsText("empty")));
      return;
    }
    const list = makeEl("div", "al-moments-list");
    moments.forEach((moment) => list.appendChild(this.renderMoment(moment)));
    this.containerEl.appendChild(list);
  }
}

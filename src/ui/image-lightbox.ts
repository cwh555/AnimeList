import { Menu, Modal, Notice } from "obsidian";
import type { ImageSectionService } from "../data/image-section-service";
import { imageSectionText } from "../features/image-sections/text";
import { copyImageToClipboard } from "./image-clipboard";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

export interface ImageLightboxEntry {
  path: string;
  sourcePath: string;
}

export function imageLightboxEntries(sourcePath: string, paths: readonly string[]): ImageLightboxEntry[] {
  return paths.map((path) => ({ path, sourcePath }));
}

export function imageLightboxZoomFromWheel(current: number, deltaY: number): number {
  const next = current * Math.exp(-deltaY * 0.0015);
  return Math.max(1, Math.min(5, next));
}

export class ImageLightboxModal extends Modal {
  private index: number;
  private stage: HTMLElement | null = null;
  private canvas: HTMLElement | null = null;
  private image: HTMLImageElement | null = null;
  private missing: HTMLElement | null = null;
  private counter: HTMLElement | null = null;
  private previous: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private pan: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
  private syncToken = 0;
  private fitFrame = 0;
  private readonly preloadResults = new Map<string, Promise<boolean>>();

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly service: ImageSectionService,
    private readonly entries: readonly ImageLightboxEntry[],
    startIndex: number,
  ) {
    super(app);
    this.index = Math.max(0, Math.min(entries.length - 1, startIndex));
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-image-lightbox");
    this.modalEl.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("resize", this.handleViewportResize);
    this.buildShell();
    this.syncEntry();
    this.scheduleStageFit();
  }

  onClose(): void {
    this.syncToken += 1;
    this.preloadResults.clear();
    if (this.fitFrame) window.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = 0;
    window.removeEventListener("resize", this.handleViewportResize);
    this.modalEl.removeEventListener("keydown", this.handleKeydown);
    this.contentEl.replaceChildren();
  }

  private readonly handleViewportResize = (): void => this.scheduleStageFit();

  private scheduleStageFit(): void {
    if (this.fitFrame) window.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = window.requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fitStageToModal();
    });
  }

  private fitStageToModal(): void {
    if (!this.stage || !this.image || !this.counter) return;
    const modalHeight = this.modalEl.getBoundingClientRect().height;
    const contentHeight = this.contentEl.getBoundingClientRect().height;
    if (modalHeight <= 0 || contentHeight <= 0) return;
    const contentStyle = window.getComputedStyle(this.contentEl);
    const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
    const gap = Number.parseFloat(contentStyle.rowGap || contentStyle.gap) || 0;
    const counterHeight = this.counter.getBoundingClientRect().height;
    const modalChrome = Math.max(0, modalHeight - contentHeight);
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const safeViewportHeight = Math.max(120, viewportHeight - 24);
    const available = Math.max(120,
      safeViewportHeight - modalChrome - paddingTop - paddingBottom - gap - counterHeight,
    );
    const fittedHeight = `${available}px`;
    this.stage.style.setProperty("height", fittedHeight);
    this.stage.style.setProperty("max-height", fittedHeight);
    this.image.style.setProperty("max-height", fittedHeight);
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "c") {
      event.preventDefault();
      void this.copyCurrent();
      return;
    }
    if (event.key === "0") {
      this.resetZoom();
      return;
    }
    if (event.key === "ArrowLeft" && this.entries.length > 1) {
      event.preventDefault();
      this.move(-1);
    } else if (event.key === "ArrowRight" && this.entries.length > 1) {
      event.preventDefault();
      this.move(1);
    }
  };

  private move(delta: number): void {
    if (!this.entries.length) return;
    this.index = (this.index + delta + this.entries.length) % this.entries.length;
    this.resetZoom();
    this.syncEntry();
  }

  private async copyCurrent(): Promise<void> {
    const entry = this.entries[this.index];
    if (!entry) return;
    try {
      await copyImageToClipboard(this.service, entry.sourcePath, entry.path);
      new Notice(imageSectionText("copied"));
    } catch (error) {
      new Notice(imageSectionText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private buildShell(): void {
    this.contentEl.replaceChildren();
    this.stage = makeEl("div", "al-image-lightbox-stage");
    this.canvas = makeEl("div", "al-image-lightbox-canvas");
    Object.assign(this.stage.style, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      alignItems: "stretch",
      justifyContent: "normal",
      boxSizing: "border-box",
    });
    Object.assign(this.canvas.style, {
      position: "relative",
      display: "flex",
      minWidth: "0",
      minHeight: "0",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    });
    this.image = makeEl("img", "al-image-lightbox-image");
    this.image.alt = "";
    this.image.draggable = false;
    this.image.hidden = true;
    this.image.addEventListener("load", () => this.scheduleStageFit());
    this.image.addEventListener("error", () => {
      if (!this.image || !this.missing) return;
      this.image.hidden = true;
      this.missing.hidden = false;
      this.stage?.removeAttribute("aria-busy");
    });
    this.image.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) => item.setTitle(imageSectionText("copyImage")).setIcon("copy").onClick(() => void this.copyCurrent()));
      menu.showAtMouseEvent(event);
    });
    this.missing = makeEl("div", "al-image-lightbox-missing", imageSectionText("missing"));
    this.missing.hidden = true;
    this.canvas.append(this.image, this.missing);

    if (this.entries.length > 1) {
      this.stage.classList.add("has-navigation");
      Object.assign(this.stage.style, {
        gridTemplateColumns: "clamp(40px, 8vw, 48px) minmax(0, 1fr) clamp(40px, 8vw, 48px)",
      });
      this.previous = makeEl("button", "al-image-lightbox-nav is-previous");
      this.previous.type = "button";
      this.previous.setAttribute("aria-label", imageSectionText("previousImage"));
      setAnimeListIcon(this.previous, "chevron-left");
      Object.assign(this.previous.style, {
        position: "static",
        top: "auto",
        left: "auto",
        alignSelf: "center",
        justifySelf: "center",
        transform: "none",
      });
      this.previous.addEventListener("click", (event) => { event.stopPropagation(); this.move(-1); });
      this.next = makeEl("button", "al-image-lightbox-nav is-next");
      this.next.type = "button";
      this.next.setAttribute("aria-label", imageSectionText("nextImage"));
      setAnimeListIcon(this.next, "chevron-right");
      Object.assign(this.next.style, {
        position: "static",
        top: "auto",
        right: "auto",
        alignSelf: "center",
        justifySelf: "center",
        transform: "none",
      });
      this.next.addEventListener("click", (event) => { event.stopPropagation(); this.move(1); });
      this.stage.append(this.previous, this.canvas, this.next);
    } else {
      this.stage.append(this.canvas);
    }

    this.stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom = imageLightboxZoomFromWheel(this.zoom, event.deltaY);
      if (this.zoom === 1) { this.panX = 0; this.panY = 0; }
      this.applyTransform();
    }, { passive: false });
    this.stage.addEventListener("dblclick", () => this.resetZoom());
    this.stage.addEventListener("pointerdown", (event) => {
      if (this.zoom <= 1 || event.button !== 0 || !(event.target instanceof Node) || !this.canvas?.contains(event.target)) return;
      this.pan = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: this.panX, startY: this.panY };
      this.stage?.setPointerCapture(event.pointerId);
      this.stage?.classList.add("is-panning");
    });
    this.stage.addEventListener("pointermove", (event) => {
      if (!this.pan || this.pan.id !== event.pointerId) return;
      this.panX = this.pan.startX + event.clientX - this.pan.x;
      this.panY = this.pan.startY + event.clientY - this.pan.y;
      this.applyTransform();
    });
    const endPan = (event: PointerEvent) => {
      if (!this.pan || this.pan.id !== event.pointerId) return;
      this.pan = null;
      this.stage?.classList.remove("is-panning");
    };
    this.stage.addEventListener("pointerup", endPan);
    this.stage.addEventListener("pointercancel", endPan);

    this.counter = makeEl("div", "al-image-lightbox-counter");
    this.contentEl.append(this.stage, this.counter);
  }

  private applyTransform(): void {
    if (!this.image) return;
    this.image.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.stage?.classList.toggle("is-zoomed", this.zoom > 1);
  }

  private resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  private loadResource(resourcePath: string): Promise<boolean> {
    const cached = this.preloadResults.get(resourcePath);
    if (cached !== undefined) return cached;
    const request = new Promise<boolean>((resolve) => {
      const preload = createEl("img");
      preload.decoding = "async";
      preload.addEventListener("load", () => resolve(preload.naturalWidth > 0), { once: true });
      preload.addEventListener("error", () => resolve(false), { once: true });
      preload.src = resourcePath;
    });
    this.preloadResults.set(resourcePath, request);
    return request;
  }

  private preloadAdjacent(): void {
    if (this.entries.length < 2) return;
    for (const offset of [-1, 1]) {
      const entry = this.entries[(this.index + offset + this.entries.length) % this.entries.length];
      if (!entry) continue;
      const resolved = this.service.resolve(entry.path, entry.sourcePath);
      if (!resolved.resourcePath) continue;
      void this.loadResource(resolved.resourcePath);
    }
  }

  private syncEntry(): void {
    const entry = this.entries[this.index];
    if (!entry || !this.image || !this.missing || !this.counter) return;
    const targetIndex = this.index;
    const token = ++this.syncToken;
    const resolved = this.service.resolve(entry.path, entry.sourcePath);
    this.counter.textContent = `${targetIndex + 1} / ${this.entries.length}`;
    this.applyTransform();
    this.scheduleStageFit();

    if (!resolved.resourcePath) {
      this.stage?.removeAttribute("aria-busy");
      this.image.removeAttribute("src");
      this.image.hidden = true;
      this.missing.hidden = false;
      this.preloadAdjacent();
      return;
    }

    this.stage?.setAttribute("aria-busy", "true");
    this.missing.hidden = true;
    const resourcePath = resolved.resourcePath;
    void this.loadResource(resourcePath).then((loaded) => {
      if (token !== this.syncToken || targetIndex !== this.index || !this.image || !this.missing) return;
      this.stage?.removeAttribute("aria-busy");
      if (!loaded) {
        this.image.removeAttribute("src");
        this.image.hidden = true;
        this.missing.hidden = false;
        return;
      }
      this.image.src = resourcePath;
      this.image.hidden = false;
      this.missing.hidden = true;
      this.scheduleStageFit();
    });
    this.preloadAdjacent();
  }

}

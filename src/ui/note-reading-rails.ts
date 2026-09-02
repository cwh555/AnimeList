export interface NoteReadingRailGeometryInput {
  layerLeft: number;
  layerRight: number;
  contentLeft: number;
  contentRight: number;
  gap?: number;
  leftPreferredWidth?: number;
  rightPreferredWidth?: number;
  leftMinWidth?: number;
  rightMinWidth?: number;
}

export interface NoteReadingRailGeometry {
  enabled: boolean;
  leftX: number;
  rightX: number;
  leftWidth: number;
  rightWidth: number;
}

export const NOTE_READING_RAIL_DEFAULTS = Object.freeze({
  gap: 18,
  leftPreferredWidth: 240,
  rightPreferredWidth: 260,
  leftMinWidth: 188,
  rightMinWidth: 208,
});

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function calculateNoteReadingRailGeometry(
  input: NoteReadingRailGeometryInput,
): NoteReadingRailGeometry {
  const layerLeft = finite(input.layerLeft, 0);
  const layerRight = finite(input.layerRight, layerLeft);
  const contentLeft = finite(input.contentLeft, layerLeft);
  const contentRight = finite(input.contentRight, contentLeft);
  const gap = Math.max(0, finite(input.gap ?? NOTE_READING_RAIL_DEFAULTS.gap, NOTE_READING_RAIL_DEFAULTS.gap));
  const leftPreferredWidth = Math.max(0, finite(
    input.leftPreferredWidth ?? NOTE_READING_RAIL_DEFAULTS.leftPreferredWidth,
    NOTE_READING_RAIL_DEFAULTS.leftPreferredWidth,
  ));
  const rightPreferredWidth = Math.max(0, finite(
    input.rightPreferredWidth ?? NOTE_READING_RAIL_DEFAULTS.rightPreferredWidth,
    NOTE_READING_RAIL_DEFAULTS.rightPreferredWidth,
  ));
  const leftMinWidth = Math.max(0, finite(
    input.leftMinWidth ?? NOTE_READING_RAIL_DEFAULTS.leftMinWidth,
    NOTE_READING_RAIL_DEFAULTS.leftMinWidth,
  ));
  const rightMinWidth = Math.max(0, finite(
    input.rightMinWidth ?? NOTE_READING_RAIL_DEFAULTS.rightMinWidth,
    NOTE_READING_RAIL_DEFAULTS.rightMinWidth,
  ));

  if (layerRight <= layerLeft || contentRight <= contentLeft) {
    return { enabled: false, leftX: 0, rightX: 0, leftWidth: 0, rightWidth: 0 };
  }

  const leftAvailable = Math.max(0, contentLeft - layerLeft - gap);
  const rightAvailable = Math.max(0, layerRight - contentRight - gap);
  const leftWidth = Math.min(leftPreferredWidth, Math.floor(leftAvailable));
  const rightWidth = Math.min(rightPreferredWidth, Math.floor(rightAvailable));
  const enabled = leftWidth >= leftMinWidth && rightWidth >= rightMinWidth;

  if (!enabled) return { enabled: false, leftX: 0, rightX: 0, leftWidth, rightWidth };

  return {
    enabled: true,
    leftX: contentLeft - layerLeft - gap - leftWidth,
    rightX: contentRight - layerLeft + gap,
    leftWidth,
    rightWidth,
  };
}

export interface NoteReadingRailsMountOptions {
  container: HTMLElement;
  card: HTMLElement;
  topbar: HTMLElement;
  body: HTMLElement;
}

export interface NoteReadingRailsController {
  sync(): void;
  dispose(): void;
  isActive(): boolean;
}

class MountedNoteReadingRails implements NoteReadingRailsController {
  private readonly extras: Element[];
  private readonly layer: HTMLElement;
  private readonly leftRail: HTMLElement;
  private readonly rightRail: HTMLElement;
  private readonly outline: HTMLElement;
  private readonly outlineList: HTMLElement;
  private readonly resizeObserver: ResizeObserver | null;
  private outlineHeadings: HTMLElement[] = [];
  private outlineTexts: string[] = [];
  private active = false;
  private disposed = false;
  private frame: number | null = null;

  private readonly handleWindowResize = (): void => this.scheduleSync();

  constructor(
    private readonly previewView: HTMLElement,
    private readonly sizer: HTMLElement,
    private readonly mountHost: HTMLElement,
    private readonly options: NoteReadingRailsMountOptions,
  ) {
    this.extras = Array.from(options.container.children)
      .filter((child) => child !== options.card);

    this.layer = createDiv({ cls: "al-note-reading-rail-layer" });
    this.leftRail = createEl("aside", { cls: "al-note-reading-left" });
    this.rightRail = createEl("aside", { cls: "al-note-reading-right" });
    this.outline = createEl("nav", { cls: "al-note-reading-outline" });
    this.outline.setAttribute("aria-label", "On this note");
    const outlineLabel = createDiv({ cls: "al-note-reading-outline-label" });
    outlineLabel.textContent = "On this note";
    this.outlineList = createDiv({ cls: "al-note-reading-outline-list" });
    this.outline.append(outlineLabel, this.outlineList);
    this.layer.append(this.leftRail, this.rightRail);
    this.mountHost.insertBefore(this.layer, this.sizer);

    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.scheduleSync())
      : null;
    this.resizeObserver?.observe(this.previewView);
    this.resizeObserver?.observe(this.sizer);
    this.resizeObserver?.observe(this.options.container);
    window.addEventListener("resize", this.handleWindowResize, { passive: true });
    this.scheduleSync();
  }

  isActive(): boolean {
    return this.active;
  }

  sync(): void {
    if (this.disposed) return;
    if (!this.layer.isConnected || !this.previewView.isConnected || !this.sizer.isConnected || !this.options.container.isConnected) {
      this.dispose();
      return;
    }
    const layerRect = this.layer.getBoundingClientRect();
    const contentRect = this.sizer.getBoundingClientRect();
    const geometry = calculateNoteReadingRailGeometry({
      layerLeft: layerRect.left,
      layerRight: layerRect.right,
      contentLeft: contentRect.left,
      contentRight: contentRect.right,
    });

    if (!geometry.enabled) {
      this.deactivate();
      return;
    }

    this.activate();
    this.refreshOutline();
    this.leftRail.style.left = `${geometry.leftX}px`;
    this.leftRail.style.width = `${geometry.leftWidth}px`;
    this.rightRail.style.left = `${geometry.rightX}px`;
    this.rightRail.style.width = `${geometry.rightWidth}px`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
    this.deactivate();
    this.layer.remove();
  }

  private scheduleSync(): void {
    if (this.disposed) return;
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.sync();
    });
  }

  private activate(): void {
    if (this.active) return;
    this.leftRail.appendChild(this.options.body);
    this.rightRail.appendChild(this.options.topbar);
    for (const extra of this.extras) this.rightRail.appendChild(extra);
    this.rightRail.appendChild(this.outline);
    this.options.card.classList.add("is-note-reading-rail-source");
    this.previewView.classList.add("al-note-reading-active");
    this.active = true;
  }

  private refreshOutline(): void {
    const items = Array.from(this.sizer.querySelectorAll<HTMLElement>("h2, h3"))
      .filter((heading) => !this.options.container.contains(heading))
      .map((heading) => ({ heading, text: heading.textContent?.trim() ?? "" }))
      .filter((item) => item.text.length > 0);

    const unchanged = items.length === this.outlineHeadings.length
      && items.every((item, index) => (
        item.heading === this.outlineHeadings[index]
        && item.text === this.outlineTexts[index]
      ));
    if (unchanged) return;

    this.outlineHeadings = items.map((item) => item.heading);
    this.outlineTexts = items.map((item) => item.text);
    this.outlineList.replaceChildren();
    this.outline.hidden = items.length === 0;

    for (const { heading, text } of items) {
      const button = createEl("button", { cls: "al-note-reading-outline-item" });
      button.type = "button";
      button.textContent = text;
      if (heading.tagName === "H3") button.classList.add("is-subheading");
      button.addEventListener("click", () => {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      this.outlineList.appendChild(button);
    }
  }

  private deactivate(): void {
    if (!this.active) return;
    this.options.card.append(this.options.topbar, this.options.body);
    for (const extra of this.extras) this.options.container.appendChild(extra);
    this.options.card.classList.remove("is-note-reading-rail-source");
    this.previewView.classList.remove("al-note-reading-active");
    this.active = false;
  }
}

const mountedRails = new Map<HTMLElement, NoteReadingRailsController>();

export function installNoteReadingRails(
  options: NoteReadingRailsMountOptions,
): NoteReadingRailsController | null {
  const existing = mountedRails.get(options.container);
  if (existing) {
    existing.dispose();
    mountedRails.delete(options.container);
  }

  const previewView = options.container.closest<HTMLElement>(".markdown-preview-view");
  const sizer = options.container.closest<HTMLElement>(".markdown-preview-sizer");
  const mountHost = sizer?.parentElement ?? null;
  if (!previewView || !sizer || !mountHost) return null;
  if (Array.from(mountHost.children).some((child) => child.classList.contains("al-note-reading-rail-layer"))) {
    return null;
  }
  const controller = new MountedNoteReadingRails(previewView, sizer, mountHost, options);
  mountedRails.set(options.container, controller);
  return controller;
}

export function disposeMountedNoteReadingRails(): void {
  for (const controller of mountedRails.values()) controller.dispose();
  mountedRails.clear();
}

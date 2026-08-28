import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { ReleaseTrackingService } from "../data/release-tracking-service";
import type { MediaItem } from "../domain/media-types";
import { isReleaseTrackingEnabled, isReleaseTrackingMedia } from "../domain/release-tracking-enrollment";
import { releaseTrackingText } from "../features/release-tracking/text";
import { MEDIA_UI_LABELS } from "./ui-helpers";
import { bindImageFallback } from "./image-fallback";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(name: string): HTMLElement {
  const node = el("span", "al-release-manager-icon");
  setIcon(node, name);
  return node;
}

function cover(item: MediaItem): HTMLElement {
  const node = el("div", "al-release-manager-cover");
  const source = item.coverSources?.src || item.cover;
  if (!source) {
    const fallback = icon("book-open");
    node.appendChild(fallback);
    return node;
  }
  const image = el("img");
  image.alt = item.title;
  image.loading = "lazy";
  image.decoding = "async";
  bindImageFallback(image, () => icon("book-open"));
  if (item.coverSources?.srcset) image.srcset = item.coverSources.srcset;
  node.appendChild(image);
  image.src = source;
  return node;
}

export interface ReleaseTrackingManagerModalOptions {
  onApplied(): Promise<void> | void;
}

export class ReleaseTrackingManagerModal extends Modal {
  private readonly items: MediaItem[];
  private readonly checked = new Map<string, boolean>();
  private readonly initialChecked = new Map<string, boolean>();

  constructor(
    app: App,
    private readonly service: ReleaseTrackingService,
    items: readonly MediaItem[],
    private readonly options: ReleaseTrackingManagerModalOptions,
  ) {
    super(app);
    this.items = items.filter(isReleaseTrackingMedia);
    for (const item of this.items) {
      const enabled = isReleaseTrackingEnabled(item, this.service.state.read(item.filePath, item.mediaType), this.service.state.hasExplicitStatus(item.filePath));
      this.checked.set(item.filePath, enabled);
      this.initialChecked.set(item.filePath, enabled);
    }
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-release-manager-modal");
    this.render();
  }

  private selectedCount(): number {
    return [...this.checked.values()].filter(Boolean).length;
  }

  private render(): void {
    this.contentEl.replaceChildren();
    const heading = el("header", "al-release-manager-heading");
    const copy = el("div");
    copy.append(
      el("h2", "", releaseTrackingText("manager.title")),
      el("p", "", releaseTrackingText("manager.description")),
    );
    heading.append(icon("list-checks"), copy);
    this.contentEl.appendChild(heading);

    const toolbar = el("div", "al-release-manager-toolbar");
    const count = el("span", "al-release-manager-count");
    const updateCount = (): void => {
      count.textContent = releaseTrackingText("manager.selected", { selected: this.selectedCount(), total: this.items.length });
    };
    updateCount();
    const all = el("button", "al-secondary-button", releaseTrackingText("manager.all"));
    all.type = "button";
    const none = el("button", "al-secondary-button", releaseTrackingText("manager.none"));
    none.type = "button";
    toolbar.append(count, all, none);
    this.contentEl.appendChild(toolbar);

    const list = el("div", "al-release-manager-list");
    const inputs: HTMLInputElement[] = [];
    for (const item of this.items) {
      const label = el("label", "al-release-manager-row");
      const input = el("input", "al-release-manager-checkbox");
      input.type = "checkbox";
      input.checked = this.checked.get(item.filePath) ?? true;
      input.addEventListener("change", () => {
        this.checked.set(item.filePath, input.checked);
        updateCount();
      });
      inputs.push(input);
      const identity = el("div", "al-release-manager-copy");
      identity.append(
        el("strong", "", item.title),
        el("span", "", MEDIA_UI_LABELS.type[item.mediaType]),
      );
      label.append(input, cover(item), identity);
      list.appendChild(label);
    }
    this.contentEl.appendChild(list);

    const setAll = (value: boolean): void => {
      inputs.forEach((input, index) => {
        input.checked = value;
        const item = this.items[index];
        if (item) this.checked.set(item.filePath, value);
      });
      updateCount();
    };
    all.addEventListener("click", () => setAll(true));
    none.addEventListener("click", () => setAll(false));

    const footer = el("footer", "al-release-manager-actions");
    const cancel = el("button", "al-secondary-button", releaseTrackingText("manager.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const apply = el("button", "mod-cta", releaseTrackingText("manager.apply"));
    apply.type = "button";
    apply.addEventListener("click", () => {
      apply.disabled = true;
      void (async () => {
        for (const item of this.items) {
          const enabled = this.checked.get(item.filePath) ?? true;
          if (enabled === this.initialChecked.get(item.filePath)) continue;
          if (enabled) await this.service.state.enable(item.filePath, item.mediaType);
          else await this.service.state.disable(item.filePath, item.mediaType);
        }
        await this.options.onApplied();
        this.close();
      })().finally(() => { apply.disabled = false; });
    });
    footer.append(cancel, apply);
    this.contentEl.appendChild(footer);
  }
}

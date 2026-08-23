import { Modal, Notice } from "obsidian";
import type { ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import { imageExtensionFor } from "../domain/image-section";
import { imageSectionText } from "../features/image-sections/text";
import { imageAssetsFromClipboard } from "./image-clipboard";
import { armPointerDrag, type PointerDragPoint } from "./pointer-drag";
import { animateLayoutChange, transitionSurface } from "./layout-motion";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";
import { bindImageFallback } from "./image-fallback";

interface QueuedImage {
  asset: ImageSectionAssetInput;
  previewUrl: string;
  key: number;
}

function previewUrl(asset: ImageSectionAssetInput): string {
  return URL.createObjectURL(new Blob([asset.data], { type: asset.contentType || "application/octet-stream" }));
}

export class AddImageSectionModal extends Modal {
  private queue: QueuedImage[] = [];
  private nextKey = 1;
  private urlValue = "";
  private busy = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly service: ImageSectionService,
    private readonly onAdd: (assets: readonly ImageSectionAssetInput[]) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-image-add-modal");
    this.setTitle(imageSectionText("addImages"));
    this.render();
    this.modalEl.addEventListener("paste", this.handlePaste);
  }

  onClose(): void {
    this.modalEl.removeEventListener("paste", this.handlePaste);
    for (const queued of this.queue) URL.revokeObjectURL(queued.previewUrl);
    this.queue = [];
    this.contentEl.replaceChildren();
  }

  private readonly handlePaste = (event: ClipboardEvent): void => {
    const files = [...(event.clipboardData?.files ?? [])];
    const html = event.clipboardData?.getData("text/html") ?? "";
    if (!files.length && !/data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(html)) return;
    event.preventDefault();
    void imageAssetsFromClipboard(event).then((assets) => {
      const accepted = assets.filter((asset) => imageExtensionFor(asset.name, asset.contentType));
      if (!accepted.length) return;
      for (const asset of accepted) {
        this.queue.push({ asset, previewUrl: previewUrl(asset), key: this.nextKey++ });
      }
      this.render();
    });
  };

  private async addFiles(files: readonly File[]): Promise<void> {
    const accepted = files.filter((file) => imageExtensionFor(file.name, file.type));
    if (!accepted.length) return;
    const assets = await Promise.all(accepted.map((file) => imageAssetFromFile(file)));
    for (const asset of assets) {
      this.queue.push({ asset, previewUrl: previewUrl(asset), key: this.nextKey++ });
    }
    this.render();
  }

  private async addUrl(): Promise<void> {
    const url = this.urlValue.trim();
    if (!url || this.busy) return;
    this.busy = true;
    this.render();
    try {
      const asset = await this.service.fetchRemoteAsset(url);
      this.queue.push({ asset, previewUrl: previewUrl(asset), key: this.nextKey++ });
      this.urlValue = "";
    } catch (error) {
      new Notice(imageSectionText("urlFailed", { error: errorMessage(error) }));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private removeQueued(key: number): void {
    const index = this.queue.findIndex((entry) => entry.key === key);
    if (index < 0) return;
    URL.revokeObjectURL(this.queue[index].previewUrl);
    this.queue.splice(index, 1);
    this.render();
  }


  private queueDropTarget(queue: HTMLElement, point: PointerDragPoint): { key: number | null; placement: "before" | "after" | "append" } | null {
    const hit = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null;
    if (!hit || !queue.contains(hit)) return null;
    const item = hit.closest<HTMLElement>(".al-image-queue-item[data-queue-key]");
    if (!item) return { key: null, placement: "append" };
    const key = Number(item.dataset.queueKey);
    if (!Number.isFinite(key)) return null;
    const rect = item.getBoundingClientRect();
    return { key, placement: point.clientX < rect.left + rect.width / 2 ? "before" : "after" };
  }

  private clearQueueDropIndicators(queue: HTMLElement): void {
    for (const item of queue.querySelectorAll<HTMLElement>(".al-image-queue-item.is-drop-before, .al-image-queue-item.is-drop-after")) {
      item.removeClass("is-drop-before", "is-drop-after");
    }
  }

  private markQueueDropTarget(queue: HTMLElement, target: { key: number | null; placement: "before" | "after" | "append" } | null): void {
    this.clearQueueDropIndicators(queue);
    if (!target?.key) return;
    const item = queue.querySelector<HTMLElement>(`.al-image-queue-item[data-queue-key="${target.key}"]`);
    item?.addClass(target.placement === "before" ? "is-drop-before" : "is-drop-after");
  }

  private reorderQueued(movingKey: number, targetKey: number | null, placement: "before" | "after" | "append"): void {
    const movingIndex = this.queue.findIndex((entry) => entry.key === movingKey);
    if (movingIndex < 0 || targetKey === movingKey) return;
    const [moving] = this.queue.splice(movingIndex, 1);
    if (!moving) return;
    if (placement === "append" || targetKey == null) {
      this.queue.push(moving);
      return;
    }
    const targetIndex = this.queue.findIndex((entry) => entry.key === targetKey);
    const insertAt = targetIndex < 0 ? this.queue.length : targetIndex + (placement === "after" ? 1 : 0);
    this.queue.splice(insertAt, 0, moving);
  }

  private syncQueueDom(queue: HTMLElement): void {
    const elements = new Map<number, HTMLElement>();
    for (const item of queue.querySelectorAll<HTMLElement>(".al-image-queue-item[data-queue-key]")) {
      const key = Number(item.dataset.queueKey);
      if (Number.isFinite(key)) elements.set(key, item);
    }
    const ordered = this.queue.map((entry) => elements.get(entry.key)).filter((item): item is HTMLElement => Boolean(item));
    void animateLayoutChange(ordered, () => queue.replaceChildren(...ordered));
  }

  private bindQueuedPointerDrag(item: HTMLElement, queue: HTMLElement, key: number): void {
    item.addEventListener("pointerdown", (event) => {
      const target = event.target as Element | null;
      const handle = target?.closest(".al-image-queue-drag-handle");
      if (event.pointerType !== "mouse" && !handle) return;
      if (event.pointerType === "mouse" && target?.closest(".al-image-queue-remove") && !handle) return;
      let dropTarget: { key: number | null; placement: "before" | "after" | "append" } | null = null;
      armPointerDrag({
        event,
        captureElement: item,
        dragElement: item,
        ghostClass: "al-image-queue-drag-ghost",
        onMove: (point) => {
          dropTarget = this.queueDropTarget(queue, point);
          this.markQueueDropTarget(queue, dropTarget);
        },
        onDrop: () => {
          this.clearQueueDropIndicators(queue);
          if (!dropTarget) return;
          this.reorderQueued(key, dropTarget.key, dropTarget.placement);
          this.syncQueueDom(queue);
        },
        onCancel: () => this.clearQueueDropIndicators(queue),
      });
    });
  }

  private async submit(): Promise<void> {
    if (!this.queue.length || this.busy) return;
    this.busy = true;
    this.render();
    try {
      await this.onAdd(this.queue.map((entry) => entry.asset));
      this.close();
    } catch (error) {
      this.busy = false;
      new Notice(imageSectionText("addFailed", { error: errorMessage(error) }));
      this.render();
    }
  }

  private render(): void {
    if (this.contentEl.childElementCount) transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    else this.contentEl.replaceChildren();

    const picker = makeEl("div", "al-image-picker");
    picker.tabIndex = 0;
    picker.setAttribute("role", "button");
    picker.setAttribute("aria-label", imageSectionText("chooseOrDrop"));
    const icon = makeEl("div", "al-image-picker-icon");
    setAnimeListIcon(icon, "image-plus");
    picker.append(
      icon,
      makeEl("strong", "", imageSectionText("chooseOrDrop")),
      makeEl("span", "al-image-picker-hint", imageSectionText("pasteHint")),
    );

    const input = makeEl("input", "al-image-file-input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      if (files.length) void this.addFiles(files);
      input.value = "";
    });
    picker.addEventListener("click", () => input.click());
    picker.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      input.click();
    });
    picker.addEventListener("dragover", (event) => {
      event.preventDefault();
      picker.addClass("is-dragging");
    });
    picker.addEventListener("dragleave", () => picker.removeClass("is-dragging"));
    picker.addEventListener("drop", (event) => {
      event.preventDefault();
      picker.removeClass("is-dragging");
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) void this.addFiles(files);
    });
    picker.appendChild(input);
    this.contentEl.appendChild(picker);

    const urlRow = makeEl("div", "al-image-url-row");
    const urlGroup = makeEl("div", "al-image-url-group");
    urlGroup.appendChild(makeEl("span", "al-image-url-label", imageSectionText("urlLabel")));
    const urlInput = makeEl("input");
    urlInput.type = "url";
    urlInput.placeholder = imageSectionText("urlPlaceholder");
    urlInput.value = this.urlValue;
    urlInput.disabled = this.busy;
    urlInput.addEventListener("input", () => { this.urlValue = urlInput.value; });
    urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void this.addUrl(); }
    });
    urlGroup.appendChild(urlInput);
    const addUrl = makeEl("button", "mod-cta", imageSectionText("urlAdd"));
    addUrl.type = "button";
    addUrl.disabled = this.busy;
    addUrl.addEventListener("click", () => void this.addUrl());
    urlRow.append(urlGroup, addUrl);
    this.contentEl.appendChild(urlRow);

    if (this.queue.length) {
      const queueHead = makeEl("div", "al-image-queue-head", imageSectionText("selectedCount", { count: this.queue.length }));
      const queue = makeEl("div", "al-image-queue");
      for (const entry of this.queue) {
        const item = makeEl("div", "al-image-queue-item");
        item.dataset.queueKey = String(entry.key);
        const image = makeEl("img");
        image.alt = "";
        image.draggable = false;
        bindImageFallback(image, () => {
          const missing = makeEl("div", "al-image-queue-preview-missing");
          setAnimeListIcon(missing, "image-off");
          return missing;
        });
        const remove = makeEl("button", "al-image-queue-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", imageSectionText("delete"));
        remove.addEventListener("click", () => this.removeQueued(entry.key));
        const dragHandle = makeEl("button", "al-image-queue-drag-handle");
        dragHandle.type = "button";
        dragHandle.setAttribute("aria-label", imageSectionText("dragImage"));
        dragHandle.title = imageSectionText("dragImage");
        setAnimeListIcon(dragHandle, "grip-vertical");
        dragHandle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        item.append(image, remove, dragHandle);
        image.src = entry.previewUrl;
        this.bindQueuedPointerDrag(item, queue, entry.key);
        queue.appendChild(item);
      }
      this.contentEl.append(queueHead, queue);
    }

    const actions = makeEl("div", "al-image-modal-actions");
    const cancel = makeEl("button", "", imageSectionText("cancel"));
    cancel.type = "button";
    cancel.disabled = this.busy;
    cancel.addEventListener("click", () => this.close());
    const confirm = makeEl("button", "mod-cta", imageSectionText("confirmAdd", { count: this.queue.length }));
    confirm.type = "button";
    confirm.disabled = this.busy || this.queue.length === 0;
    confirm.addEventListener("click", () => void this.submit());
    actions.append(cancel, confirm);
    this.contentEl.appendChild(actions);
  }
}

export class DeleteImageSectionModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly onDelete: () => Promise<void>,
    private readonly count = 1,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-image-delete-modal");
    const multiple = this.count > 1;
    this.setTitle(multiple
      ? imageSectionText("deleteManyTitle", { count: this.count })
      : imageSectionText("deleteTitle"));
    this.contentEl.appendChild(makeEl(
      "p",
      "al-image-delete-copy",
      multiple
        ? imageSectionText("deleteManyMessage", { count: this.count })
        : imageSectionText("deleteMessage"),
    ));
    const actions = makeEl("div", "al-image-modal-actions");
    const cancel = makeEl("button", "", imageSectionText("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = makeEl("button", "mod-warning", multiple
      ? imageSectionText("deleteManyConfirm", { count: this.count })
      : imageSectionText("deleteConfirm"));
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void this.onDelete().then(() => this.close()).catch((error) => {
        confirm.disabled = false;
        new Notice(imageSectionText("deleteFailed", { error: errorMessage(error) }));
      });
    });
    actions.append(cancel, confirm);
    this.contentEl.appendChild(actions);
  }
}

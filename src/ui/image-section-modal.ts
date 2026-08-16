import { Modal, Notice } from "obsidian";
import type { ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import { imageExtensionFor } from "../domain/image-section";
import { imageSectionText } from "../image-section-text";
import { imageAssetsFromClipboard } from "./image-clipboard";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

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
    this.contentEl.replaceChildren();

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
        const image = makeEl("img");
        image.src = entry.previewUrl;
        image.alt = "";
        const remove = makeEl("button", "al-image-queue-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", imageSectionText("delete"));
        remove.addEventListener("click", () => this.removeQueued(entry.key));
        item.append(image, remove);
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

import { Modal, Notice } from "obsidian";
import type { ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import { imageExtensionFor } from "../domain/image-section";
import type { MomentEditorInput } from "../data/moments-service";
import type { MomentItem } from "../domain/moments";
import { momentsText } from "../moments-text";
import { imageAssetsFromClipboard } from "./image-clipboard";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";

interface PendingAsset {
  key: number;
  asset: ImageSectionAssetInput;
  previewUrl: string;
}

function assetPreview(asset: ImageSectionAssetInput): string {
  return URL.createObjectURL(new Blob([asset.data], { type: asset.contentType || "application/octet-stream" }));
}

export class MomentEditorModal extends Modal {
  private readonly isEdit: boolean;
  private textValue: string;
  private retainedImages: string[];
  private pending: PendingAsset[] = [];
  private nextKey = 1;
  private urlValue = "";
  private busy = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly imageService: ImageSectionService,
    private readonly sourcePath: string,
    initial: MomentItem | null,
    private readonly onSave: (input: MomentEditorInput) => Promise<void>,
  ) {
    super(app);
    this.isEdit = initial !== null;
    this.textValue = initial?.text ?? "";
    this.retainedImages = [...(initial?.images ?? [])];
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-moment-editor-modal");
    this.setTitle(this.isEdit ? momentsText("editMoment") : momentsText("addMoment"));
    this.modalEl.addEventListener("paste", this.handlePaste);
    this.render();
  }

  onClose(): void {
    this.modalEl.removeEventListener("paste", this.handlePaste);
    for (const pending of this.pending) URL.revokeObjectURL(pending.previewUrl);
    this.pending = [];
    this.contentEl.replaceChildren();
  }

  private readonly handlePaste = (event: ClipboardEvent): void => {
    const files = [...(event.clipboardData?.files ?? [])];
    const html = event.clipboardData?.getData("text/html") ?? "";
    if (!files.length && !/data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(html)) return;
    event.preventDefault();
    void imageAssetsFromClipboard(event).then((assets) => this.queueAssets(assets));
  };

  private queueAssets(assets: readonly ImageSectionAssetInput[]): void {
    for (const asset of assets) {
      if (!imageExtensionFor(asset.name, asset.contentType)) continue;
      this.pending.push({ key: this.nextKey++, asset, previewUrl: assetPreview(asset) });
    }
    this.render();
  }

  private async addFiles(files: readonly File[]): Promise<void> {
    const accepted = files.filter((file) => imageExtensionFor(file.name, file.type));
    if (!accepted.length) return;
    this.queueAssets(await Promise.all(accepted.map((file) => imageAssetFromFile(file))));
  }

  private async addUrl(): Promise<void> {
    const url = this.urlValue.trim();
    if (!url || this.busy) return;
    this.busy = true;
    this.render();
    try {
      const asset = await this.imageService.fetchRemoteAsset(url);
      this.urlValue = "";
      this.queueAssets([asset]);
    } catch (error) {
      new Notice(`Could not load image URL: ${errorMessage(error)}`);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private removeRetained(path: string): void {
    this.retainedImages = this.retainedImages.filter((value) => value !== path);
    this.render();
  }

  private removePending(key: number): void {
    const index = this.pending.findIndex((entry) => entry.key === key);
    if (index < 0) return;
    URL.revokeObjectURL(this.pending[index].previewUrl);
    this.pending.splice(index, 1);
    this.render();
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    if (!this.textValue.trim()) {
      new Notice(momentsText("validationText"));
      return;
    }
    if (this.retainedImages.length + this.pending.length === 0) {
      new Notice(momentsText("validationImages"));
      return;
    }
    this.busy = true;
    this.render();
    try {
      await this.onSave({
        text: this.textValue,
        retainedImages: this.retainedImages,
        newAssets: this.pending.map((entry) => entry.asset),
      });
      this.close();
    } catch (error) {
      this.busy = false;
      new Notice(momentsText("saveFailed", { error: errorMessage(error) }));
      this.render();
    }
  }

  private renderImageRow(): HTMLElement {
    const row = makeEl("div", "al-moment-editor-images");
    row.addEventListener("dragover", (event) => { event.preventDefault(); row.addClass("is-dragging"); });
    row.addEventListener("dragleave", () => row.removeClass("is-dragging"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.removeClass("is-dragging");
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) void this.addFiles(files);
    });

    for (const path of this.retainedImages) {
      const item = makeEl("div", "al-moment-editor-image");
      const resolved = this.imageService.resolve(path, this.sourcePath);
      if (resolved.resourcePath) {
        const image = makeEl("img");
        image.src = resolved.thumbnailSources?.src || resolved.resourcePath;
        image.alt = "";
        item.appendChild(image);
      } else item.appendChild(makeEl("div", "al-moment-editor-image-missing", momentsText("missingImage")));
      const remove = makeEl("button", "al-moment-editor-image-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", momentsText("removeImage"));
      setAnimeListIcon(remove, "x");
      remove.addEventListener("click", () => this.removeRetained(path));
      item.appendChild(remove);
      row.appendChild(item);
    }

    for (const pending of this.pending) {
      const item = makeEl("div", "al-moment-editor-image is-pending");
      const image = makeEl("img");
      image.src = pending.previewUrl;
      image.alt = "";
      const remove = makeEl("button", "al-moment-editor-image-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", momentsText("removeImage"));
      setAnimeListIcon(remove, "x");
      remove.addEventListener("click", () => this.removePending(pending.key));
      item.append(image, remove);
      row.appendChild(item);
    }

    if (!this.retainedImages.length && !this.pending.length) {
      row.appendChild(makeEl("div", "al-moment-editor-images-empty", momentsText("validationImages")));
    }
    return row;
  }

  private render(): void {
    this.contentEl.replaceChildren();

    const textGroup = makeEl("label", "al-moment-editor-field");
    textGroup.appendChild(makeEl("span", "al-moment-editor-label", momentsText("textLabel")));
    const textarea = makeEl("textarea", "al-moment-editor-text");
    textarea.value = this.textValue;
    textarea.placeholder = momentsText("textPlaceholder");
    textarea.rows = 5;
    textarea.disabled = this.busy;
    textarea.addEventListener("input", () => { this.textValue = textarea.value; });
    textGroup.appendChild(textarea);
    this.contentEl.appendChild(textGroup);

    const imageHead = makeEl("div", "al-moment-editor-image-head");
    imageHead.appendChild(makeEl("span", "al-moment-editor-label", momentsText("imagesLabel")));
    const choose = makeEl("button", "al-moment-editor-add-images");
    choose.type = "button";
    choose.disabled = this.busy;
    setAnimeListIcon(choose, "plus");
    choose.appendChild(makeEl("span", "", momentsText("addImages")));
    const input = makeEl("input", "al-moment-editor-file-input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      if (files.length) void this.addFiles(files);
      input.value = "";
    });
    choose.addEventListener("click", () => input.click());
    imageHead.append(choose, input);
    this.contentEl.append(imageHead, this.renderImageRow());

    const hint = makeEl("div", "al-moment-editor-paste-hint", momentsText("pasteHint"));
    this.contentEl.appendChild(hint);

    const urlRow = makeEl("div", "al-moment-editor-url-row");
    const urlInput = makeEl("input");
    urlInput.type = "url";
    urlInput.placeholder = momentsText("urlPlaceholder");
    urlInput.value = this.urlValue;
    urlInput.disabled = this.busy;
    urlInput.addEventListener("input", () => { this.urlValue = urlInput.value; });
    urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void this.addUrl(); }
    });
    const urlAdd = makeEl("button", "", momentsText("addUrl"));
    urlAdd.type = "button";
    urlAdd.disabled = this.busy;
    urlAdd.addEventListener("click", () => void this.addUrl());
    urlRow.append(urlInput, urlAdd);
    this.contentEl.appendChild(urlRow);

    const actions = makeEl("div", "al-moment-editor-actions");
    const cancel = makeEl("button", "", momentsText("cancel"));
    cancel.type = "button";
    cancel.disabled = this.busy;
    cancel.addEventListener("click", () => this.close());
    const save = makeEl("button", "mod-cta", this.isEdit ? momentsText("save") : momentsText("create"));
    save.type = "button";
    save.disabled = this.busy;
    save.addEventListener("click", () => void this.submit());
    actions.append(cancel, save);
    this.contentEl.appendChild(actions);
  }
}

export class DeleteMomentModal extends Modal {
  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly onDelete: () => Promise<void>,
  ) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("animelist-moment-delete-modal");
    this.setTitle(momentsText("deleteTitle"));
    this.contentEl.appendChild(makeEl("p", "al-moment-delete-copy", momentsText("deleteMessage")));
    const actions = makeEl("div", "al-moment-editor-actions");
    const cancel = makeEl("button", "", momentsText("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = makeEl("button", "mod-warning", momentsText("deleteConfirm"));
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void this.onDelete().then(() => this.close()).catch((error) => {
        confirm.disabled = false;
        new Notice(momentsText("deleteFailed", { error: errorMessage(error) }));
      });
    });
    actions.append(cancel, confirm);
    this.contentEl.appendChild(actions);
  }
}

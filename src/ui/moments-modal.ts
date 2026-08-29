import { Modal, Notice } from "obsidian";
import type { ImageSectionAssetInput, ImageSectionService } from "../data/image-section-service";
import { imageAssetFromFile } from "../data/image-section-service";
import { imageExtensionFor } from "../domain/image-section";
import type { MomentEditorInput } from "../data/moments-service";
import type { MomentItem } from "../domain/moments";
import {
  DEFAULT_MOMENT_STACK_GAP,
  MAX_MOMENT_STACK_GAP,
  MIN_MOMENT_STACK_GAP,
  momentStackAverageGap,
  momentStackGapAfterDrag,
  momentStackGapsWithDelta,
  normalizeMomentImageLayout,
  normalizeMomentStackGap,
  normalizeMomentStackGapsY,
  type MomentImageLayout,
} from "../domain/moment-image-layout";
import { momentsText } from "../features/moments/text";
import { imageAssetsFromClipboard } from "./image-clipboard";
import { errorMessage, makeEl, setAnimeListIcon } from "./ui-helpers";
import { createMomentStackVisual, type MomentStackVisual } from "./moment-stack";
import { bindImageFallback } from "./image-fallback";
import { isolateHorizontalSwipeSurface } from "./mobile-swipe-isolation";

interface PendingAsset {
  key: number;
  asset: ImageSectionAssetInput;
  previewUrl: string;
  stackGapY: number;
}

function momentEditorMissingNode(): HTMLElement {
  return makeEl("div", "al-moment-editor-image-missing", momentsText("missingImage"));
}

function assetPreview(asset: ImageSectionAssetInput): string {
  return URL.createObjectURL(new Blob([asset.data], { type: asset.contentType || "application/octet-stream" }));
}

export class MomentEditorModal extends Modal {
  private readonly isEdit: boolean;
  private textValue: string;
  private sourceValue: string;
  private positionValue: string;
  private speakerValue: string;
  private tagsValue: string;
  private noteValue: string;
  private retainedImages: string[];
  private readonly retainedStackGapsY = new Map<string, number>();
  private imageLayout: MomentImageLayout;
  private stackGapControl = DEFAULT_MOMENT_STACK_GAP;
  private pending: PendingAsset[] = [];
  private nextKey = 1;
  private urlValue = "";
  private busy = false;
  private readonly retainedImageTiles = new Map<string, HTMLElement>();
  private readonly pendingImageTiles = new Map<number, HTMLElement>();

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
    this.sourceValue = initial?.source ?? "";
    this.positionValue = initial?.position ?? "";
    this.speakerValue = initial?.speaker ?? "";
    this.tagsValue = (initial?.tags ?? []).join(", ");
    this.noteValue = initial?.note ?? "";
    this.retainedImages = [...(initial?.images ?? [])];
    this.imageLayout = normalizeMomentImageLayout(initial?.imageLayout);
    const initialGaps = normalizeMomentStackGapsY(initial?.stackGapsY, this.retainedImages.length);
    this.stackGapControl = momentStackAverageGap(initialGaps, this.retainedImages.length);
    this.retainedImages.forEach((path, index) => this.retainedStackGapsY.set(path, initialGaps[index]));
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
    this.retainedImageTiles.clear();
    this.pendingImageTiles.clear();
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
      this.pending.push({
        key: this.nextKey++,
        asset,
        previewUrl: assetPreview(asset),
        stackGapY: this.stackGapControl,
      });
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
    this.retainedStackGapsY.delete(path);
    if (this.retainedImages.length + this.pending.length < 2) this.imageLayout = "carousel";
    this.render();
  }

  private removePending(key: number): void {
    const index = this.pending.findIndex((entry) => entry.key === key);
    if (index < 0) return;
    URL.revokeObjectURL(this.pending[index].previewUrl);
    this.pending.splice(index, 1);
    if (this.retainedImages.length + this.pending.length < 2) this.imageLayout = "carousel";
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
        source: this.sourceValue,
        position: this.positionValue,
        speaker: this.speakerValue,
        tags: this.tagsValue.split(/[\n,，、]/).map((value) => value.trim()).filter(Boolean),
        note: this.noteValue,
        imageLayout: this.imageLayout,
        stackGapsY: this.stackGapsValues(),
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

  private renderMetadataFields(): HTMLElement {
    const grid = makeEl("div", "al-moment-editor-metadata-grid");

    const createInputField = (labelKey: Parameters<typeof momentsText>[0], value: string, onInput: (value: string) => void, placeholderKey?: Parameters<typeof momentsText>[0]): HTMLElement => {
      const field = makeEl("label", "al-moment-editor-field");
      field.appendChild(makeEl("span", "al-moment-editor-label", momentsText(labelKey)));
      const input = makeEl("input");
      input.type = "text";
      input.value = value;
      input.disabled = this.busy;
      if (placeholderKey) input.placeholder = momentsText(placeholderKey);
      input.addEventListener("input", () => onInput(input.value));
      field.appendChild(input);
      return field;
    };

    grid.append(
      createInputField("sourceLabel", this.sourceValue, (value) => { this.sourceValue = value; }, "sourcePlaceholder"),
      createInputField("positionLabel", this.positionValue, (value) => { this.positionValue = value; }, "positionPlaceholder"),
      createInputField("speakerLabel", this.speakerValue, (value) => { this.speakerValue = value; }, "speakerPlaceholder"),
      createInputField("tagsLabel", this.tagsValue, (value) => { this.tagsValue = value; }, "tagsPlaceholder"),
    );

    const noteField = makeEl("label", "al-moment-editor-field al-moment-editor-note-field");
    noteField.appendChild(makeEl("span", "al-moment-editor-label", momentsText("noteLabel")));
    const note = makeEl("textarea", "al-moment-editor-note");
    note.value = this.noteValue;
    note.placeholder = momentsText("notePlaceholder");
    note.rows = 3;
    note.disabled = this.busy;
    note.addEventListener("input", () => { this.noteValue = note.value; });
    noteField.appendChild(note);

    const wrapper = makeEl("div", "al-moment-editor-metadata");
    wrapper.append(grid, noteField);
    return wrapper;
  }

  private stackGapsValues(): number[] {
    const values = [
      ...this.retainedImages.map((path) => this.retainedStackGapsY.get(path) ?? this.stackGapControl),
      ...this.pending.map((entry) => entry.stackGapY),
    ];
    return normalizeMomentStackGapsY(values, values.length, this.stackGapControl);
  }

  private setStackGap(index: number, gapY: number): void {
    if (index < this.retainedImages.length) {
      this.retainedStackGapsY.set(this.retainedImages[index], gapY);
      return;
    }
    const pending = this.pending[index - this.retainedImages.length];
    if (pending) pending.stackGapY = gapY;
  }

  private setStackGaps(gapsY: readonly number[]): void {
    const normalized = normalizeMomentStackGapsY(gapsY, this.retainedImages.length + this.pending.length);
    normalized.forEach((gap, index) => this.setStackGap(index, gap));
  }

  private stackPreviewItems() {
    return [
      ...this.retainedImages.map((path) => {
        const resolved = this.imageService.resolve(path, this.sourcePath);
        return {
          ...(resolved.resourcePath ? { src: resolved.thumbnailSources?.src || resolved.resourcePath } : {}),
          missingLabel: momentsText("missingImage"),
        };
      }),
      ...this.pending.map((entry) => ({
        src: entry.previewUrl,
        missingLabel: momentsText("missingImage"),
      })),
    ];
  }

  private bindStackLayerDrag(
    layer: HTMLElement,
    index: number,
    view: MomentStackVisual,
    onGapsChanged: (gapsY: readonly number[]) => void,
  ): void {
    const label = makeEl("span", "al-moment-stack-adjust-value", `${this.stackGapsValues()[index]}px`);
    layer.appendChild(label);
    layer.addEventListener("pointerdown", (event) => {
      if (this.busy || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startGap = this.stackGapsValues()[index];
      layer.addClass("is-adjusting");
      try { layer.setPointerCapture(pointerId); } catch { /* embedded tests may not establish capture */ }

      const move = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const nextGap = momentStackGapAfterDrag(startGap, moveEvent.clientY - startY);
        this.setStackGap(index, nextGap);
        const gaps = this.stackGapsValues();
        view.setGapsY(gaps);
        label.textContent = `${gaps[index]}px`;
        onGapsChanged(gaps);
      };
      const cleanup = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        layer.removeClass("is-adjusting");
        try { if (layer.hasPointerCapture(pointerId)) layer.releasePointerCapture(pointerId); } catch { /* already released */ }
      };
      const up = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== pointerId) return;
        upEvent.preventDefault();
        cleanup();
      };
      const cancel = (cancelEvent: PointerEvent): void => {
        if (cancelEvent.pointerId !== pointerId) return;
        cleanup();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    });
  }

  private renderImageLayoutControls(): HTMLElement | null {
    const imageCount = this.retainedImages.length + this.pending.length;
    if (imageCount < 2) return null;

    const section = makeEl("section", "al-moment-editor-layout");
    const heading = makeEl("div", "al-moment-editor-layout-head");
    heading.appendChild(makeEl("span", "al-moment-editor-label", momentsText("imageLayoutLabel")));
    const modes = makeEl("div", "al-moment-editor-layout-modes");
    const modeButton = (mode: MomentImageLayout, label: string): HTMLButtonElement => {
      const button = makeEl("button", "al-moment-editor-layout-mode", label);
      button.type = "button";
      button.disabled = this.busy;
      button.classList.toggle("is-active", this.imageLayout === mode);
      button.setAttribute("aria-pressed", this.imageLayout === mode ? "true" : "false");
      button.addEventListener("click", () => { this.imageLayout = mode; this.render(); });
      return button;
    };
    modes.append(
      modeButton("carousel", momentsText("imageLayoutCarousel")),
      modeButton("stacked", momentsText("imageLayoutStacked")),
    );
    heading.appendChild(modes);
    section.appendChild(heading);
    if (this.imageLayout !== "stacked") return section;

    const gaps = this.stackGapsValues();
    this.stackGapControl = momentStackAverageGap(gaps, imageCount);
    const revealRow = makeEl("label", "al-moment-editor-reveal");
    revealRow.appendChild(makeEl("span", "al-moment-editor-layout-caption", momentsText("stackRevealLabel")));
    const reveal = makeEl("input");
    reveal.type = "range";
    reveal.min = String(MIN_MOMENT_STACK_GAP);
    reveal.max = String(MAX_MOMENT_STACK_GAP);
    reveal.step = "1";
    reveal.value = String(this.stackGapControl);
    reveal.disabled = this.busy;
    const output = makeEl("output", "al-moment-editor-reveal-value", `${this.stackGapControl}px`);
    revealRow.append(reveal, output);

    const preview = createMomentStackVisual({
      items: this.stackPreviewItems(),
      gapsY: gaps,
      className: "al-moment-stack-editor",
    });
    const syncGapControls = (nextGaps: readonly number[]): void => {
      this.stackGapControl = momentStackAverageGap(nextGaps, imageCount);
      reveal.value = String(this.stackGapControl);
      output.textContent = `${this.stackGapControl}px`;
      nextGaps.forEach((gap, index) => {
        if (index === 0) return;
        const layer = preview.layer(index);
        const label = layer?.querySelector<HTMLElement>(".al-moment-stack-adjust-value");
        if (label) label.textContent = `${gap}px`;
      });
    };
    reveal.addEventListener("input", () => {
      const nextControl = normalizeMomentStackGap(reveal.value);
      const adjusted = momentStackGapsWithDelta(this.stackGapsValues(), imageCount, nextControl - this.stackGapControl);
      this.setStackGaps(adjusted);
      preview.setGapsY(adjusted);
      syncGapControls(adjusted);
    });
    section.append(revealRow, makeEl("div", "al-moment-editor-stack-hint", momentsText("stackAdjustHint")), preview.element);
    for (let index = 1; index < imageCount; index += 1) {
      const layer = preview.layer(index);
      if (layer) this.bindStackLayerDrag(layer, index, preview, syncGapControls);
    }
    return section;
  }

  private renderImageRow(): HTMLElement {
    const row = isolateHorizontalSwipeSurface(makeEl("div", "al-moment-editor-images"));
    row.addEventListener("dragover", (event) => { event.preventDefault(); row.addClass("is-dragging"); });
    row.addEventListener("dragleave", () => row.removeClass("is-dragging"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.removeClass("is-dragging");
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) void this.addFiles(files);
    });

    const retainedSet = new Set(this.retainedImages);
    for (const key of this.retainedImageTiles.keys()) if (!retainedSet.has(key)) this.retainedImageTiles.delete(key);
    for (const path of this.retainedImages) {
      let item = this.retainedImageTiles.get(path);
      const resolved = this.imageService.resolve(path, this.sourcePath);
      if (!item) {
        item = makeEl("div", "al-moment-editor-image");
        const remove = makeEl("button", "al-moment-editor-image-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", momentsText("removeImage"));
        setAnimeListIcon(remove, "x");
        remove.addEventListener("click", () => this.removeRetained(path));
        item.appendChild(remove);
        this.retainedImageTiles.set(path, item);
      }
      let image = item.querySelector<HTMLImageElement>("img");
      let missing = item.querySelector<HTMLElement>(".al-moment-editor-image-missing");
      if (resolved.resourcePath) {
        missing?.remove();
        if (!image) {
          image = makeEl("img");
          image.alt = "";
          bindImageFallback(image, momentEditorMissingNode);
          item.insertBefore(image, item.firstChild);
        }
        const source = resolved.thumbnailSources?.src || resolved.resourcePath;
        if (image.getAttribute("src") !== source) image.src = source;
      } else {
        image?.remove();
        image = null;
        if (!missing) {
          missing = momentEditorMissingNode();
          item.insertBefore(missing, item.firstChild);
        }
      }
      row.appendChild(item);
    }

    const pendingKeys = new Set(this.pending.map((entry) => entry.key));
    for (const key of this.pendingImageTiles.keys()) if (!pendingKeys.has(key)) this.pendingImageTiles.delete(key);
    for (const pending of this.pending) {
      let item = this.pendingImageTiles.get(pending.key);
      if (!item) {
        item = makeEl("div", "al-moment-editor-image is-pending");
        const image = makeEl("img");
        image.alt = "";
        bindImageFallback(image, momentEditorMissingNode);
        const remove = makeEl("button", "al-moment-editor-image-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", momentsText("removeImage"));
        setAnimeListIcon(remove, "x");
        remove.addEventListener("click", () => this.removePending(pending.key));
        item.append(image, remove);
        image.src = pending.previewUrl;
        this.pendingImageTiles.set(pending.key, item);
      }
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
    this.contentEl.appendChild(this.renderMetadataFields());

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
    const layoutControls = this.renderImageLayoutControls();
    if (layoutControls) this.contentEl.appendChild(layoutControls);

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

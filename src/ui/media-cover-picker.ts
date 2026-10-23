import type { TFile } from "obsidian";
import type { MediaCoverAssetInput } from "../domain/manual-media";
import type { AnimeListUiHost } from "./plugin-host";
import { bindImageFallback } from "./image-fallback";
import { makeEl } from "./ui-helpers";
import { createFilePickerControl, createUiAction } from "./ui-primitives";
import { uiText } from "../ui-text";

export interface MediaCoverPicker {
  readonly element: HTMLElement;
  readSelectedAsset(): Promise<MediaCoverAssetInput | null>;
  dispose(): void;
}

/** Edit existing media without mutating the vault until Save is pressed. */
export function createMediaCoverPicker(
  plugin: AnimeListUiHost,
  note: TFile,
  frontmatter: Record<string, unknown>,
): MediaCoverPicker {
  const host = makeEl("section", "al-edit-cover-picker");
  host.appendChild(makeEl("h3", "al-form-section-heading", uiText("edit.coverHeading")));
  host.appendChild(makeEl("p", "al-edit-cover-hint", uiText("edit.coverHint")));

  const picker = createFilePickerControl(uiText("edit.coverChoose"), "image/jpeg,image/png,image/webp,image/avif");
  picker.input.classList.add("al-edit-cover-file");
  const clear = createUiAction(uiText("edit.coverClear"));
  clear.classList.add("al-edit-cover-clear");
  clear.hidden = true;
  const controls = makeEl("div", "al-edit-cover-controls");
  controls.append(picker.element, clear);
  host.appendChild(controls);

  // The identity header already shows the current cover; expand comparisons only on selection.
  const previews = makeEl("div", "al-edit-cover-previews");
  previews.hidden = true;
  const current = makeEl("div", "al-edit-cover-preview");
  current.appendChild(makeEl("span", "al-edit-cover-caption", uiText("edit.coverCurrent")));
  const currentPath = typeof frontmatter.cover === "string" ? frontmatter.cover : "";
  const fallbackPath = typeof frontmatter.cover_remote === "string" ? frontmatter.cover_remote : "";
  const resource = plugin.resolveMediaCoverPath(currentPath, note.path)
    || plugin.resolveMediaCoverPath(fallbackPath, note.path);
  if (resource) {
    const image = makeEl("img");
    image.alt = uiText("edit.coverCurrent");
    bindImageFallback(image, () => makeEl("span", "al-edit-cover-empty", uiText("edit.coverMissing")));
    current.appendChild(image);
    image.src = resource;
  } else {
    current.appendChild(makeEl("span", "al-edit-cover-empty", uiText("edit.coverMissing")));
  }

  const replacement = makeEl("div", "al-edit-cover-preview");
  replacement.appendChild(makeEl("span", "al-edit-cover-caption", uiText("edit.coverNew")));
  const replacementBody = makeEl("div", "al-edit-cover-replacement-body");
  replacement.appendChild(replacementBody);
  previews.append(current, replacement);
  host.appendChild(previews);

  let selected: File | null = null;
  let previewUrl: string | null = null;
  const renderSelection = (): void => {
    replacementBody.replaceChildren();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    clear.hidden = !selected;
    previews.hidden = !selected;
    if (!selected) {
      replacementBody.appendChild(makeEl("span", "al-edit-cover-empty", uiText("edit.coverUnchanged")));
      return;
    }
    previewUrl = URL.createObjectURL(selected);
    const image = makeEl("img");
    image.alt = selected.name;
    bindImageFallback(image, () => makeEl("span", "al-edit-cover-empty", uiText("edit.coverMissing")));
    replacementBody.append(image, makeEl("span", "al-edit-cover-filename", selected.name));
    image.src = previewUrl;
  };
  picker.input.addEventListener("change", () => {
    selected = picker.input.files?.[0] ?? null;
    renderSelection();
  });
  clear.addEventListener("click", () => {
    selected = null;
    picker.input.value = "";
    renderSelection();
  });
  renderSelection();

  return {
    element: host,
    async readSelectedAsset() {
      const file = selected;
      if (!file) return null;
      if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error("Cover image must be a nonempty file no larger than 20 MB.");
      return { name: file.name, contentType: file.type, data: await file.arrayBuffer() };
    },
    dispose() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      selected = null;
    },
  };
}

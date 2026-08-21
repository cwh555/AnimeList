export function scoreDashboardDragStackDepth(count: number): 0 | 1 | 2 {
  if (!Number.isFinite(count) || count <= 1) return 0;
  return count === 2 ? 1 : 2;
}

export function createScoreDashboardDragPreview(
  documentRef: Document,
  poster: HTMLElement,
  count: number,
): HTMLElement {
  const rect = poster.getBoundingClientRect();
  const preview = documentRef.body.createDiv({ cls: "al-score-drag-preview" });
  preview.dataset.stackDepth = String(scoreDashboardDragStackDepth(count));
  preview.style.width = `${Math.max(24, rect.width)}px`;
  preview.style.height = `${Math.max(36, rect.height)}px`;

  const card = preview.createDiv({ cls: "al-score-drag-preview-card" });
  const image = poster.querySelector<HTMLImageElement>(".al-score-poster-image");
  if (image) {
    const clonedImage = image.cloneNode(true) as HTMLImageElement;
    clonedImage.removeAttribute("loading");
    clonedImage.draggable = false;
    card.appendChild(clonedImage);
  } else {
    const missing = poster.querySelector<HTMLElement>(".al-score-poster-missing");
    if (missing) card.appendChild(missing.cloneNode(true));
  }

  if (count > 1) {
    preview.createEl("strong", {
      cls: "al-score-drag-preview-count",
      text: String(count),
    });
  }
  return preview;
}

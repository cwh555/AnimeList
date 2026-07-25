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
  const preview = documentRef.createElement("div");
  preview.className = "al-score-drag-preview";
  preview.dataset.stackDepth = String(scoreDashboardDragStackDepth(count));
  preview.style.width = `${Math.max(24, rect.width)}px`;
  preview.style.height = `${Math.max(36, rect.height)}px`;

  const card = documentRef.createElement("div");
  card.className = "al-score-drag-preview-card";
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
  preview.appendChild(card);

  if (count > 1) {
    const badge = documentRef.createElement("strong");
    badge.className = "al-score-drag-preview-count";
    badge.textContent = String(count);
    preview.appendChild(badge);
  }

  documentRef.body.appendChild(preview);
  return preview;
}

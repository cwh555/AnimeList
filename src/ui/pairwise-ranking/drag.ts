import { rankingGridDropPosition } from "../../domain/pairwise-ranking";

/**
 * Pointer-driven sortable preview. Dragging begins only from the handle.
 * A lightweight DOM clone follows the pointer in a viewport overlay while the
 * source keeps its grid slot as a placeholder. No image files are generated.
 */
export function installRankingDrag(
  handle: HTMLButtonElement,
  row: HTMLElement,
  rows: HTMLElement[],
  originalRank: number,
  commit: (rank: number) => void,
): void {
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    commit(originalRank + (event.key === "ArrowUp" ? -1 : 1));
  });

  handle.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || handle.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const id = event.pointerId;
    const origin = row.getBoundingClientRect();
    const offsetX = event.clientX - origin.left;
    const offsetY = event.clientY - origin.top;
    const preview = row.cloneNode(true) as HTMLElement;
    preview.classList.add("al-ranking-drag-preview");
    preview.classList.remove("is-rank-moving", "is-rank-target");
    preview.setAttribute("aria-hidden", "true");
    preview.inert = true;
    preview.style.width = origin.width + "px";
    const place = (x: number, y: number): void => {
      preview.style.transform = "translate3d(" + Math.round(x - offsetX) + "px," + Math.round(y - offsetY) + "px,0)";
    };
    document.body.appendChild(preview);
    place(event.clientX, event.clientY);
    row.classList.add("is-rank-moving");
    let target = originalRank;
    let interacted = false;
    let cancelled = false;
    try {
      handle.setPointerCapture(id);
    } catch {
      preview.remove();
      row.classList.remove("is-rank-moving");
      return;
    }
    const host = row.closest<HTMLElement>(".al-workspace-page-body") ??
      row.closest<HTMLElement>(".view-content");
    const update = (next: PointerEvent): void => {
      if (next.pointerId !== id) return;
      interacted = true;
      place(next.clientX, next.clientY);
      if (host) {
        const rect = host.getBoundingClientRect();
        if (next.clientY < rect.top + 40) host.scrollTop -= 14;
        else if (next.clientY > rect.bottom - 40) host.scrollTop += 14;
      }
      const bounds = rows.map((item) => item.getBoundingClientRect());
      target = rankingGridDropPosition(bounds, originalRank - 1, next.clientX, next.clientY);
      rows.forEach((item, index) =>
        item.classList.toggle("is-rank-target", index === Math.min(rows.length - 1, target - 1)));
    };
    const finish = (apply: boolean): void => {
      if (cancelled) return;
      cancelled = true;
      handle.removeEventListener("pointermove", update);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      rows.forEach((item) => item.classList.remove("is-rank-target"));
      row.classList.remove("is-rank-moving");
      preview.remove();
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
      if (apply && interacted && target !== originalRank) commit(target);
    };
    const onUp = (up: PointerEvent): void => { if (up.pointerId === id) finish(true); };
    const onCancel = (up: PointerEvent): void => { if (up.pointerId === id) finish(false); };
    handle.addEventListener("pointermove", update);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  });
}

import { setIcon } from "obsidian";
import type { MediaItem } from "../../domain/media-types";
import { makeEl } from "../ui-helpers";

/** One cover renderer shared by the rank list and the comparison dialog. */
export function rankingCover(item: MediaItem | undefined, className: string): HTMLElement {
  const shell = makeEl("span", className);
  if (!item) { setIcon(shell, "image-off"); return shell; }
  const src = item.coverSources?.src || item.cover;
  if (!src) { setIcon(shell, "image-off"); return shell; }
  const img = makeEl("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.draggable = false;
  if (item.coverSources?.srcset) img.srcset = item.coverSources.srcset;
  img.addEventListener("error", () => {
    img.remove();
    setIcon(shell, "image-off");
  }, { once: true });
  shell.appendChild(img);
  return shell;
}

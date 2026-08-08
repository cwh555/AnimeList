import type { MediaItem } from "../types";
import { normalizeGenres } from "../domain/media-metadata";
import { providerTagDisplayLabels } from "../i18n/provider-tag-localization";

export function libraryProviderTagLabels(
  item: Pick<MediaItem, "genres" | "apiTagValues">,
): readonly string[] {
  const genres = normalizeGenres(item.genres).slice(0, 4);
  const labels = providerTagDisplayLabels(item.apiTagValues);
  return genres.map((genre) => labels.get(genre) ?? genre);
}

export function localizeLibraryProviderTags(
  container: HTMLElement,
  items: readonly MediaItem[],
): void {
  const byPath = new Map(items.map((item) => [item.filePath, item] as const));
  for (const card of container.querySelectorAll<HTMLElement>(".al-card[data-path]")) {
    const item = byPath.get(card.dataset.path ?? "");
    if (!item) continue;
    const labels = libraryProviderTagLabels(item);
    const tags = card.querySelectorAll<HTMLElement>(".al-tags .al-tag");
    tags.forEach((tag, index) => {
      if (labels[index] !== undefined) tag.textContent = labels[index];
    });
  }
}

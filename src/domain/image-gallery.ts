import { findImageSectionBlocks } from "./image-section";
import type { MediaItem, MediaType } from "./media-types";

export type ImageGalleryMediaFilter = "all" | MediaType;

export interface ImageGalleryReference {
  sessionIndex: number;
  position: number;
}

export interface ImageGalleryImage {
  key: string;
  path: string;
  sourcePath: string;
  mediaTitle: string;
  originalTitle: string;
  mediaType: MediaType;
  references: ImageGalleryReference[];
}

export interface ImageGallerySession {
  index: number;
  images: ImageGalleryImage[];
}

export interface ImageGalleryWork {
  sourcePath: string;
  title: string;
  originalTitle: string;
  mediaType: MediaType;
  sessions: ImageGallerySession[];
  images: ImageGalleryImage[];
}

export function buildImageGalleryWork(item: MediaItem, markdown: string): ImageGalleryWork | null {
  const blocks = findImageSectionBlocks(markdown);
  if (!blocks.length) return null;

  const byPath = new Map<string, ImageGalleryImage>();
  const sessions: ImageGallerySession[] = blocks.map((block, sessionIndex) => {
    const images = block.paths.map((path, position) => {
      let image = byPath.get(path);
      if (!image) {
        image = {
          key: `${item.filePath}::${path}`,
          path,
          sourcePath: item.filePath,
          mediaTitle: item.title,
          originalTitle: item.originalTitle,
          mediaType: item.mediaType,
          references: [],
        };
        byPath.set(path, image);
      }
      image.references.push({ sessionIndex, position });
      return image;
    });
    return { index: sessionIndex, images };
  });

  const images = [...byPath.values()];
  if (!images.length) return null;
  return {
    sourcePath: item.filePath,
    title: item.title,
    originalTitle: item.originalTitle,
    mediaType: item.mediaType,
    sessions,
    images,
  };
}

export function filterImageGalleryWorks(
  works: readonly ImageGalleryWork[],
  type: ImageGalleryMediaFilter,
  query: string,
): ImageGalleryWork[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return works.filter((work) => {
    if (type !== "all" && work.mediaType !== type) return false;
    if (!normalizedQuery) return true;
    const searchText = [
      work.title,
      work.originalTitle,
      work.sourcePath,
      ...work.images.map((image) => image.path),
    ].join(" ").toLocaleLowerCase();
    return searchText.includes(normalizedQuery);
  });
}

export function flattenImageGalleryImages(works: readonly ImageGalleryWork[]): ImageGalleryImage[] {
  return works.flatMap((work) => work.images);
}

export function imageGallerySessionImages(
  work: ImageGalleryWork,
  sessionIndex: number | null,
): ImageGalleryImage[] {
  if (sessionIndex === null) return [...work.images];
  return [...(work.sessions.find((session) => session.index === sessionIndex)?.images ?? [])];
}

export function imageGalleryBoardPreview(work: ImageGalleryWork, limit = 4): ImageGalleryImage[] {
  return work.images.slice(0, Math.max(0, Math.trunc(limit)));
}

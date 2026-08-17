import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImageGalleryWork,
  filterImageGalleryWorks,
  flattenImageGalleryImages,
  imageGalleryBoardPreview,
  imageGallerySessionImages,
} from "../src/domain/image-gallery";
import type { MediaItem, MediaType } from "../src/domain/media-types";

function item(filePath: string, title: string, mediaType: MediaType): MediaItem {
  return {
    title,
    originalTitle: `${title} original`,
    mediaType,
    format: mediaType === "anime" ? "tv" : "manga",
    status: "completed",
    releaseStatus: "finished",
    progress: 1,
    total: mediaType === "anime" ? 12 : 0,
    unit: mediaType === "anime" ? "episode" : "chapter",
    score: 8,
    favorite: false,
    year: 2026,
    genres: [],
    people: [],
    platforms: [],
    sourceUrls: [],
    cover: "",
    filePath,
    updated: 0,
    updatedLabel: "",
    startedAt: "",
    completedAt: "",
    volumeLog: [],
  };
}

function work(filePath: string, title: string, mediaType: MediaType, markdown: string) {
  const result = buildImageGalleryWork(item(filePath, title, mediaType), markdown);
  assert.ok(result);
  return result;
}

describe("image gallery aggregation", () => {
  it("aggregates Image Sections without copying duplicate image references", () => {
    const result = work("Anime/Frieren.md", "Frieren", "anime", [
      "# Frieren",
      "```animelist-images",
      "- Images/frieren-a.jpg",
      "- Images/shared.jpg",
      "```",
      "paragraph stays outside the gallery model",
      "```animelist-images columns=5",
      "- Images/shared.jpg",
      "- Images/frieren-b.jpg",
      "```",
    ].join("\n"));

    assert.equal(result.sessions.length, 2);
    assert.deepEqual(result.images.map((image) => image.path), [
      "Images/frieren-a.jpg",
      "Images/shared.jpg",
      "Images/frieren-b.jpg",
    ]);
    const shared = result.images.find((image) => image.path === "Images/shared.jpg");
    assert.deepEqual(shared?.references, [
      { sessionIndex: 0, position: 1 },
      { sessionIndex: 1, position: 0 },
    ]);
    assert.equal(result.sessions[0].images[1], result.sessions[1].images[0]);
  });

  it("keeps work/session filtering separate from the unique work image list", () => {
    const result = work("Anime/Frieren.md", "Frieren", "anime", [
      "```animelist-images", "- Images/a.jpg", "- Images/shared.jpg", "```",
      "```animelist-images", "- Images/shared.jpg", "- Images/b.jpg", "```",
    ].join("\n"));

    assert.deepEqual(imageGallerySessionImages(result, null).map((image) => image.path), [
      "Images/a.jpg", "Images/shared.jpg", "Images/b.jpg",
    ]);
    assert.deepEqual(imageGallerySessionImages(result, 1).map((image) => image.path), [
      "Images/shared.jpg", "Images/b.jpg",
    ]);
    assert.deepEqual(imageGallerySessionImages(result, 99), []);
  });

  it("filters by media type and searchable work/image metadata", () => {
    const anime = work(
      "Anime/Frieren.md",
      "Frieren",
      "anime",
      "```animelist-images\n- Images/frieren-sunset.jpg\n```",
    );
    const manga = work(
      "Manga/Kaguya.md",
      "Kaguya",
      "manga",
      "```animelist-images\n- Images/kaguya-classroom.jpg\n```",
    );
    const works = [anime, manga];

    assert.deepEqual(filterImageGalleryWorks(works, "anime", "").map((value) => value.title), ["Frieren"]);
    assert.deepEqual(filterImageGalleryWorks(works, "all", "classroom").map((value) => value.title), ["Kaguya"]);
    assert.deepEqual(filterImageGalleryWorks(works, "all", "frieren original").map((value) => value.title), ["Frieren"]);
    assert.deepEqual(flattenImageGalleryImages(works).map((image) => image.mediaTitle), ["Frieren", "Kaguya"]);
  });

  it("uses a bounded work-board preview without changing source ordering", () => {
    const result = work(
      "Anime/Frieren.md",
      "Frieren",
      "anime",
      "```animelist-images\n- Images/1.jpg\n- Images/2.jpg\n- Images/3.jpg\n- Images/4.jpg\n- Images/5.jpg\n```",
    );
    assert.deepEqual(imageGalleryBoardPreview(result, 4).map((image) => image.path), [
      "Images/1.jpg", "Images/2.jpg", "Images/3.jpg", "Images/4.jpg",
    ]);
    assert.equal(result.images.length, 5);
  });
});

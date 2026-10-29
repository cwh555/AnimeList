import type { MediaItem } from "../media-types";
import type { CharacterRecord } from "./character";

/** Adapter to the existing strict-ranking domain; never enters the media library. */
export function characterRankingItems(characters: readonly CharacterRecord[]): MediaItem[] {
  return characters.map((character) => ({
    title: character.name, originalTitle: "", mediaType: "anime", format: "character",
    status: "completed", releaseStatus: "finished", progress: 0, total: 0,
    unit: "", score: null, favorite: false, year: "",
    genres: [], people: [], platforms: [], sourceUrls: [], cover: character.portrait,
    filePath: character.path, updated: 0, updatedLabel: "",
    startedAt: "", completedAt: "", volumeLog: [],
  }));
}

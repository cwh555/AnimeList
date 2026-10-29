import type { RankingState } from "../../domain/pairwise-ranking";
import { emptyRankingCollection } from "../../domain/pairwise-ranking";
import type { CharacterRankingStore } from "./ranking-store";

/** Adapt the isolated character collection to the unchanged ranking dialog protocol. */
export class CharacterRankingAdapter {
  constructor(private readonly store: CharacterRankingStore) {}
  private state(anime: RankingState["anime"]): RankingState {
    return { version: 1, anime, manga: emptyRankingCollection(), novel: emptyRankingCollection() };
  }
  async load(): Promise<RankingState> {
    return this.state(await this.store.load());
  }
  async mutate(edit: (state: RankingState) => void): Promise<RankingState> {
    const anime = await this.store.mutate(draft => {
      const state = this.state(structuredClone(draft));
      edit(state);
      // Comparison undo may replace state.anime rather than mutate it in place.
      const mutable = draft as unknown as Record<string, unknown>;
      for (const key of Object.keys(mutable)) delete mutable[key];
      Object.assign(draft, state.anime);
    });
    return this.state(anime);
  }
}

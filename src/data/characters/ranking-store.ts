import type { App } from "obsidian";
import { emptyRankingCollection, renameRankingPath, type RankingCollection } from "../../domain/pairwise-ranking";
import { saveRankingRevision } from "../pairwise-ranking/atomic-write";
import { recoverStoredRankingRound } from "../pairwise-ranking/round-schema";

interface StoredCharactersRank { version: 1; characters: RankingCollection }
function initial(): StoredCharactersRank {
  return { version: 1, characters: emptyRankingCollection() };
}
function checked(raw: unknown): StoredCharactersRank {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Corrupted character ranking");
  const data = raw as Record<string, unknown>;
  if (data.version !== 1 || !data.characters || typeof data.characters !== "object"
      || Array.isArray(data.characters)) throw new Error("Invalid character ranking schema");
  const item = data.characters as Record<string, unknown>;
  if (!Array.isArray(item.ordered) || !item.ordered.every(path => typeof path === "string")
    || !item.pending || typeof item.pending !== "object" || Array.isArray(item.pending)
    || (item.evidence !== undefined && (!item.evidence || typeof item.evidence !== "object"
      || Array.isArray(item.evidence) || Object.values(item.evidence).some(
        targets => !Array.isArray(targets) || targets.some(path => typeof path !== "string"))))
    || (item.active !== null && item.active !== undefined
      && (typeof item.active !== "object" || Array.isArray(item.active)))) {
    throw new Error("Invalid character ranking collection");
  }
  // A partially interrupted round is recovered using the same shared recovery logic as media ranking.
  const recovery = recoverStoredRankingRound(item.round, "characters");
  if (recovery.recovered) {
    // Never silently rewrite corrupted comparison data: require an explicit reset.
    throw new Error("Character ranking round requires recovery; the original data was preserved");
  }
  return data as unknown as StoredCharactersRank;
}
/** Separate vault-synced state with optimistic conflict protection, using the common ranking engine. */
export class CharacterRankingStore {
  private readonly path: string;
  private state: StoredCharactersRank | null = null;
  private original: string | null = null;
  private serial: Promise<void> = Promise.resolve();
  constructor(private readonly app: App) {
    this.path = app.vault.configDir.replace(/\/$/, "") + "/animelist-character-ranking.json";
  }
  async load(): Promise<RankingCollection> {
    if (this.state) return this.state.characters;
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(this.path)) {
      this.original = new TextDecoder().decode(await adapter.readBinary(this.path));
      this.state = checked(JSON.parse(this.original) as unknown);
    } else this.state = initial();
    return this.state.characters;
  }
  async rename(from: string, to: string): Promise<void> {
    if (!from || !to || from === to) return;
    await this.mutate(list => {
      renameRankingPath({
        version: 1, anime: list,
        manga: emptyRankingCollection(), novel: emptyRankingCollection(),
      }, from, to);
    });
  }
  async mutate(edit: (rank: RankingCollection) => void): Promise<RankingCollection> {
    let result: RankingCollection | null = null;
    const task = this.serial.then(async () => {
      const current = await this.load();
      const draft = JSON.parse(JSON.stringify(current)) as RankingCollection;
      edit(draft);
      const source = JSON.stringify(this.state);
      const target = JSON.stringify({ version: 1, characters: draft });
      if (target !== source) {
        const adapter = this.app.vault.adapter;
        const dir = this.path.slice(0, this.path.lastIndexOf("/"));
        if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
        const serialized = target + "\n";
        await saveRankingRevision(adapter, this.path, this.original, serialized);
        this.original = serialized;
        this.state = { version: 1, characters: draft };
      }
      result = draft;
    });
    this.serial = task.then(() => {}, () => {});
    await task;
    if (!result) throw new Error("Character ranking save failed");
    return result;
  }
}

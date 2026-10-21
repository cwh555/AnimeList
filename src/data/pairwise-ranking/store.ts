import { normalizePath, type App } from "obsidian";
import { emptyRankingState, type RankingState } from "../../domain/pairwise-ranking";
import { assertStoredRankingRound } from "./round-schema";

function validateRankData(input: unknown): RankingState {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid ranking data");
  const state = input as Record<string, unknown>;
  if (state.version !== 1) throw new Error("Unsupported ranking data version");
  for (const type of ["anime", "manga", "novel"]) {
    const list = state[type];
    if (!list || typeof list !== "object" || Array.isArray(list)) throw new Error("Invalid ranking collection: " + type);
    const collection = list as Record<string, unknown>;
    if (!Array.isArray(collection.ordered) || !collection.ordered.every((x) => typeof x === "string")
        || !collection.pending || typeof collection.pending !== "object" || Array.isArray(collection.pending)
        || !Array.isArray(collection.history)) throw new Error("Corrupted ranking collection: " + type);
    assertStoredRankingRound(collection.round, type);
    const attempts = [...Object.values(collection.pending as Record<string, unknown>), collection.active].filter((x) => x != null);
    for (const attempt of attempts) {
      if (typeof attempt !== "object" || Array.isArray(attempt)
        || typeof (attempt as Record<string, unknown>).path !== "string"
        || !(attempt as Record<string, unknown>).comparisons
        || typeof (attempt as Record<string, unknown>).comparisons !== "object"
        || Object.values((attempt as { comparisons: Record<string, unknown> }).comparisons)
          .some((choice) => choice !== "better" && choice !== "worse" && choice !== "skip")) {
        throw new Error("Corrupted ranking comparison: " + type);
      }
    }
    // Older snapshots cannot be trusted after a plugin upgrade; avoid undoing across schema versions.
    collection.history = [];
  }
  return state as unknown as RankingState;
}

/** A separate, vault-synced JSON file; never rewrites media Markdown or plugin settings. */
export class PairwiseRankingStore {
  private readonly path: string;
  private loaded: RankingState | null = null;
  private original: string | null = null;
  private serial: Promise<void> = Promise.resolve();

  constructor(private readonly app: App) {
    // Keep data outside the plugin installation directory: test-vault rebuilds and
    // plugin reinstalls must not delete the user ranking.
    this.path = normalizePath(app.vault.configDir + "/animelist-ranking.json");
  }

  async load(): Promise<RankingState> {
    if (this.loaded) return this.loaded;
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(this.path)) {
      const contents = new TextDecoder().decode(await adapter.readBinary(this.path));
      this.loaded = validateRankData(JSON.parse(contents) as unknown);
      this.original = contents;
    } else {
      this.loaded = emptyRankingState();
      this.original = null;
    }
    return this.loaded;
  }

  async mutate(change: (state: RankingState) => void): Promise<RankingState> {
    let answer: RankingState | null = null;
    const task: Promise<void> = this.serial.then(async (): Promise<void> => {
      const current = await this.load();
      const next = JSON.parse(JSON.stringify(current)) as RankingState;
      change(next);
      const oldValue = JSON.stringify(current);
      const newValue = JSON.stringify(next);
      if (oldValue === newValue) { answer = current; return; }
      const adapter = this.app.vault.adapter;
      const found = await adapter.exists(this.path);
      const onDisk = found ? new TextDecoder().decode(await adapter.readBinary(this.path)) : null;
      if (onDisk !== this.original) throw new Error("Ranking data changed on another device. Reload Obsidian before editing.");
      const folder = this.path.slice(0, this.path.lastIndexOf("/"));
      if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
      const bytes = new TextEncoder().encode(newValue + "\n");
      await adapter.writeBinary(this.path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      this.original = newValue + "\n";
      this.loaded = next;
      answer = next;
    });
    this.serial = task.then(() => { /* ready for next update */ }, () => { /* retain queue after a rejected update */ });
    await task;
    if (!answer) throw new Error("Ranking save did not complete");
    return answer;
  }

  /** External edits are never silently overwritten; a reload is required. */
  async remove(path: string): Promise<boolean> {
    const { removeRankingPath } = await import("../../domain/pairwise-ranking");
    let changed = false;
    await this.mutate((state) => { changed = removeRankingPath(state, path); });
    return changed;
  }

  async rename(from: string, to: string): Promise<boolean> {
    const { renameRankingPath } = await import("../../domain/pairwise-ranking");
    let changed = false;
    await this.mutate((state) => { changed = renameRankingPath(state, from, to); });
    return changed;
  }
}

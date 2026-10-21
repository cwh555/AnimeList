import { normalizePath, type App } from "obsidian";
import { emptyRankingState, type RankingState } from "../../domain/pairwise-ranking";
import { recoverStoredRankingRound } from "./round-schema";

interface LoadedRanking {
  state: RankingState;
  recovered: string[];
  needsRecompare: string[];
}
function validateRankData(input: unknown): LoadedRanking {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid ranking data");
  const state = input as Record<string, unknown>;
  if (state.version !== 1) throw new Error("Unsupported ranking data version");
  const recovered: string[] = [];
  const needsRecompare: string[] = [];
  for (const type of ["anime", "manga", "novel"]) {
    const list = state[type];
    if (!list || typeof list !== "object" || Array.isArray(list)) throw new Error("Invalid ranking collection: " + type);
    const collection = list as Record<string, unknown>;
    if (!Array.isArray(collection.ordered) || !collection.ordered.every((x) => typeof x === "string")
        || !collection.pending || typeof collection.pending !== "object" || Array.isArray(collection.pending)
        || !Array.isArray(collection.history)) throw new Error("Corrupted ranking collection: " + type);
    if (collection.pendingQueue != null && (!Array.isArray(collection.pendingQueue)
      || collection.pendingQueue.some((path: unknown) => typeof path !== "string"))) {
      throw new Error("Invalid pending review queue: " + type);
    }
    const recovery = recoverStoredRankingRound(collection.round, type);
    if (recovery.recovered) {
      recovered.push(type);
      collection.round = recovery.round;
      if (recovery.needsRecompare) needsRecompare.push(type);
      const ordered = new Set(collection.ordered);
      const pending = collection.pending as Record<string, unknown>;
      for (const path of recovery.pendingPaths) {
        if (!ordered.has(path) && !Object.hasOwn(pending, path) && path !== (collection.active as { path?: string } | null)?.path) {
          pending[path] = { path, comparisons: {} };
        }
      }
    }
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
  return { state: state as unknown as RankingState, recovered, needsRecompare };
}

/** A separate, vault-synced JSON file; never rewrites media Markdown or plugin settings. */
export class PairwiseRankingStore {
  private readonly path: string;
  private loaded: RankingState | null = null;
  private original: string | null = null;
  private recovery: { types: string[]; incompleteTypes: string[]; backupPath: string } | null = null;
  private serial: Promise<void> = Promise.resolve();

  constructor(private readonly app: App) {
    // Keep data outside the plugin installation directory: test-vault rebuilds and
    // plugin reinstalls must not delete the user ranking.
    this.path = normalizePath(app.vault.configDir + "/animelist-ranking.json");
  }

  /** An immutable copy of the precise bytes recovered from, for user inspection. */
  private async backupOriginal(raw: ArrayBuffer): Promise<string> {
    const adapter = this.app.vault.adapter;
    // Hash and copy the original byte sequence, including a possible UTF-8 BOM.
    const originalBytes = new Uint8Array(raw);
    let hash = 2166136261;
    for (const byte of originalBytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    const suffix = (hash >>> 0).toString(16).padStart(8, "0");
    const base = this.path.replace(/\.json$/, "") + ".recovery-" + suffix;
    for (let index = 0; index <= 99; index++) {
      const target = base + (index ? "-" + index : "") + ".json";
      if (await adapter.exists(target)) {
        const oldBytes = new Uint8Array(await adapter.readBinary(target));
        if (oldBytes.length === originalBytes.length
          && oldBytes.every((byte, index) => byte === originalBytes[index])) return target;
        continue;
      }
      await adapter.writeBinary(target, raw.slice(0));
      return target;
    }
    throw new Error("Unable to preserve the original ranking backup; ranking file was not changed.");
  }

  /** Recovery is local to damaged collections; the backup includes the full original JSON. */
  getRecoveryInfo(): { types: readonly string[]; incompleteTypes: readonly string[]; backupPath: string } | null {
    return this.recovery;
  }

  async load(): Promise<RankingState> {
    if (this.loaded) return this.loaded;
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(this.path)) {
      const raw = await adapter.readBinary(this.path);
      const contents = new TextDecoder().decode(raw);
      const loaded = validateRankData(JSON.parse(contents) as unknown);
      if (loaded.recovered.length) {
        // Never silently overwrite a vault-synced file. Save the exact original
        // first, then keep the fixed round only in memory until the user edits.
        const backupPath = await this.backupOriginal(raw);
        this.recovery = {
          types: loaded.recovered,
          incompleteTypes: loaded.needsRecompare,
          backupPath,
        };
      }
      this.loaded = loaded.state;
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

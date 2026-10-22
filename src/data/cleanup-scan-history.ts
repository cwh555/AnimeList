import type { App, TFile } from "obsidian";

export type CleanupScanMode = "pending" | "all";
export type CleanupScanTask = "covers" | "filenames" | "metadata" | `titles:${string}`;

type History = Record<string, string>;

function checkpoint(file: TFile): string {
  return `${file.stat.mtime}:${file.stat.size}`;
}
function key(task: CleanupScanTask, path: string): string {
  return JSON.stringify([task, path]);
}

/** A successful check is valid only for the exact file version and task. */
export class CleanupScanHistory {
  constructor(private readonly entries: History = {}) {}

  needsScan(task: CleanupScanTask, file: TFile, mode: CleanupScanMode): boolean {
    return mode === "all" || this.entries[key(task, file.path)] !== checkpoint(file);
  }

  markChecked(task: CleanupScanTask, file: TFile): void {
    this.entries[key(task, file.path)] = checkpoint(file);
  }

  snapshot(): History {
    return { ...this.entries };
  }
}

const SCAN_HISTORY_VERSION = 1;
const inFlight = new WeakMap<App, Promise<void>>();

function storagePath(app: App): string {
  return `${app.vault.configDir}/plugins/animelist/cleanup-scan-history.json`;
}

export async function readCleanupScanHistory(app: App): Promise<CleanupScanHistory> {
  try {
    const json: unknown = JSON.parse(await app.vault.adapter.read(storagePath(app)));
    if (!json || typeof json !== "object" || Array.isArray(json)) return new CleanupScanHistory();
    const data = json as { version?: unknown; entries?: unknown };
    if (data.version !== SCAN_HISTORY_VERSION || !data.entries
      || typeof data.entries !== "object" || Array.isArray(data.entries)) return new CleanupScanHistory();
    const entries = Object.fromEntries(Object.entries(data.entries).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ));
    return new CleanupScanHistory(entries);
  } catch (error) {
    // First install: the plugin has no scan record yet.
    if (typeof error === "object" && error !== null && "code" in error
      && error.code === "ENOENT") return new CleanupScanHistory();
    throw error;
  }
}

/** Serialize persistence so one scan cannot overwrite another scan's checkpoints. */
export async function saveCleanupScanHistory(
  app: App, task: CleanupScanTask, completed: readonly TFile[],
): Promise<void> {
  const previous = inFlight.get(app) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    const history = await readCleanupScanHistory(app);
    for (const file of completed) history.markChecked(task, file);
    await app.vault.adapter.write(storagePath(app), JSON.stringify({
      version: SCAN_HISTORY_VERSION, entries: history.snapshot(),
    }));
  });
  inFlight.set(app, current);
  await current;
}

export function createScanModeControl(
  parent: HTMLElement, defaultMode: CleanupScanMode = "pending",
): HTMLSelectElement {
  const label = parent.createEl("label", { cls: "al-form-field" });
  label.createSpan({ text: "Scan scope" });
  const select = label.createEl("select");
  select.createEl("option", { value: "pending", text: "Only new or unfinished items" });
  select.createEl("option", { value: "all", text: "Rescan all items" });
  select.value = defaultMode;
  return select;
}

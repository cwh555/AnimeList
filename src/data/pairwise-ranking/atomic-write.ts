import type { DataAdapter } from "obsidian";

type AtomicTextAdapter = DataAdapter & {
  process(path: string, change: (value: string) => string): Promise<string>;
};

function supportsAtomicTextProcess(adapter: DataAdapter): adapter is AtomicTextAdapter {
  return "process" in adapter && typeof adapter.process === "function";
}

const conflict = (): Error =>
  new Error("Ranking data changed on another device. Reload Obsidian before editing.");

function asBuffer(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * Use Obsidian's atomic text adapter operation where available. Older
 * supported Obsidian versions do not expose DataAdapter.process(); preserve
 * their existing optimistic conflict checks and binary write semantics.
 *
 * There is no atomic compare-and-swap guarantee in the legacy fallback.
 */
export async function saveRankingRevision(
  adapter: DataAdapter,
  path: string,
  expected: string | null,
  serialized: string,
): Promise<void> {
  if (await adapter.exists(path)) {
    if (supportsAtomicTextProcess(adapter)) {
      await adapter.process(path, (onDisk) => {
        if (onDisk !== expected) throw conflict();
        return serialized;
      });
      return;
    }
    const onDisk = new TextDecoder().decode(await adapter.readBinary(path));
    if (onDisk !== expected) throw conflict();
    await adapter.writeBinary(path, asBuffer(serialized));
    return;
  }
  if (expected !== null) throw conflict();
  await adapter.writeBinary(path, asBuffer(serialized));
}

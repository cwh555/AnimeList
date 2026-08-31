import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataAdapter } from "obsidian";
import { moveAdapterFileToVaultTrash } from "../src/data/vault-trash";

function harness(initial: string[]) {
  const files = new Set(initial);
  const directories = new Set<string>();
  const renames: Array<{ from: string; to: string }> = [];
  const adapter = {
    async exists(path: string) { return files.has(path) || directories.has(path); },
    async mkdir(path: string) { directories.add(path); },
    async rename(from: string, to: string) { files.delete(from); files.add(to); renames.push({ from, to }); },
    async remove() { throw new Error("permanent remove must not be used"); },
  } as unknown as DataAdapter;
  return { adapter, files, directories, renames };
}

describe("adapter-only AnimeList trash", () => {
  it("moves internal files into vault-local trash and avoids overwriting existing trash entries", async () => {
    const source = ".obsidian/plugins/animelist/state/image-order/demo.json";
    const h = harness([source, ".trash/AnimeList/Internal/image-order/demo.json"]);

    const target = await moveAdapterFileToVaultTrash(h.adapter, source, "image-order");

    assert.equal(target, ".trash/AnimeList/Internal/image-order/demo-2.json");
    assert.deepEqual(h.renames, [{ from: source, to: target }]);
    assert.equal(h.files.has(source), false);
    assert.equal(h.files.has(target ?? ""), true);
  });
});

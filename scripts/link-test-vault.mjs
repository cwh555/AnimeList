import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultRoot = path.resolve(process.env.ANIMELIST_TEST_VAULT || path.join(repoRoot, "test-vault"));
const pluginsRoot = path.join(vaultRoot, ".obsidian", "plugins");
const target = path.join(pluginsRoot, "animelist");

fs.mkdirSync(pluginsRoot, { recursive: true });
if (fs.existsSync(target) || fs.lstatSync(target, { throwIfNoEntry: false })) {
  fs.rmSync(target, { recursive: true, force: true });
}

const type = process.platform === "win32" ? "junction" : "dir";
fs.symlinkSync(repoRoot, target, type);
console.log(`Linked ${target} -> ${repoRoot}`);
console.log(`Open this folder as an Obsidian vault: ${vaultRoot}`);

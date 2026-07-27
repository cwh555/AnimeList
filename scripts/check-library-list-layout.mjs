import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("styles.library-list.css", "utf8");
const build = await readFile("esbuild.config.mjs", "utf8");

assert.match(source, /\.al-grid\.is-list \.al-cover-wrap\s*\{[^}]*align-self:\s*stretch;/s);
assert.match(source, /\.al-grid\.is-list \.al-cover-wrap\s*\{[^}]*aspect-ratio:\s*auto;/s);
assert.match(source, /\.al-grid\.is-list \.al-status[\s\S]*white-space:\s*nowrap;/);
assert.match(source, /\.al-grid\.is-list \.al-status[\s\S]*text-overflow:\s*ellipsis;/);
assert.match(build, /readFile\("styles\.library-list\.css", "utf8"\)/);
assert.match(build, /libraryListStyles\.trim\(\)/);

console.log("library list layout wiring: ok");

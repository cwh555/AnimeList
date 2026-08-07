import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStyleBundle, STYLE_SOURCES } from "./style-bundle.mjs";

const [source, releaseStyles] = await Promise.all([
  readFile("styles.library-list.css", "utf8"),
  readFile("styles.css", "utf8"),
]);

assert.match(source, /\.al-grid\.is-list \.al-cover-wrap\s*\{[^}]*align-self:\s*stretch;/s);
assert.match(source, /\.al-grid\.is-list \.al-cover-wrap\s*\{[^}]*aspect-ratio:\s*auto;/s);
assert.match(source, /\.al-grid\.is-list \.al-status[\s\S]*white-space:\s*nowrap;/);
assert.match(source, /\.al-grid\.is-list \.al-status[\s\S]*text-overflow:\s*ellipsis;/);
assert.ok(STYLE_SOURCES.includes("styles.library-list.css"));
assert.ok(releaseStyles.includes(source.trim()));
assert.equal(releaseStyles, await buildStyleBundle());

console.log("library list layout and reproducible style bundle: ok");

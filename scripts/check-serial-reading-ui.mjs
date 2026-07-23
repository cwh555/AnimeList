import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, buildConfig] = await Promise.all([
  readFile("styles.serial-reading.css", "utf8"),
  readFile("esbuild.config.mjs", "utf8"),
]);

assert.match(styles, /\.animelist-modal \.al-volume-editor \{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
assert.match(styles, /grid-template-areas:[\s\S]*"copy"[\s\S]*"rows"[\s\S]*"add"/);
assert.match(styles, /\.al-volume-editor-header\s*\{[\s\S]*display:\s*contents;/);
assert.match(styles, /\.al-volume-editor-header > \.al-secondary-button\s*\{[\s\S]*grid-area:\s*add;/);
assert.match(styles, /\.al-volume-row-fields\s*\{[\s\S]*minmax\(96px,[\s\S]*repeat\(2,\s*minmax\(190px,/);
assert.match(styles, /\.al-grid\.is-list \.al-progress\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
assert.match(styles, /\.al-card\.status-completed[\s\S]*width:\s*100%;/);
assert.match(styles, /\.al-card\.status-reading[\s\S]*width:\s*50%;/);
assert.match(styles, /\.al-card\.status-planned \.al-progress-row > span:first-child[\s\S]*display:\s*none;/);
assert.doesNotMatch(styles, /\.al-card\.status-planned[\s\S]*::after[\s\S]*width:\s*(?:50|100)%/);

assert.match(buildConfig, /readFile\("styles\.serial-reading\.css", "utf8"\)/);
assert.match(buildConfig, /currentStyles\.indexOf\(SERIAL_STYLE_START\)/);
assert.match(buildConfig, /writeFile\("styles\.css", outputStyles, "utf8"\)/);

console.log("Serial reading UI checks passed.");

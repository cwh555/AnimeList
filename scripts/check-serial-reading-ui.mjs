import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serialStyles, coverStyles, progressStyles, buildConfig, progressEditorSource] = await Promise.all([
  readFile("styles.serial-reading.css", "utf8"),
  readFile("styles.serial-cover.css", "utf8"),
  readFile("styles.progress.css", "utf8"),
  readFile("esbuild.config.mjs", "utf8"),
  readFile("src/additional-progress-units-ui.ts", "utf8"),
]);

assert.match(serialStyles, /\.animelist-modal \.al-volume-editor \{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
assert.match(serialStyles, /grid-template-areas:[\s\S]*"copy"[\s\S]*"rows"[\s\S]*"add"/);
assert.match(serialStyles, /\.al-volume-editor-header\s*\{[\s\S]*display:\s*contents;/);
assert.match(serialStyles, /\.al-volume-editor-header > \.al-secondary-button\s*\{[\s\S]*grid-area:\s*add;/);
assert.match(serialStyles, /\.al-volume-row-fields\s*\{[\s\S]*minmax\(96px,[\s\S]*repeat\(2,\s*minmax\(190px,/);
assert.match(serialStyles, /\.al-grid\.is-list \.al-progress\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
assert.doesNotMatch(serialStyles, /\.al-progress:not\(:has\(/);
assert.doesNotMatch(serialStyles, /\.status-(?:watching|reading|on_hold)/);

assert.match(coverStyles, /\.animelist-modal \.al-volume-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
assert.match(coverStyles, /\.al-serial-cover-button\s*\{[\s\S]*height:\s*102px;[\s\S]*width:\s*72px;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-results\s*\{[\s\S]*overflow-y:\s*auto;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-result\.is-selected\s*\{/);
assert.doesNotMatch(coverStyles, /\.al-serial-cover-results/);

assert.match(progressStyles, /\.al-progress\.is-state-progress \.al-progress-fill/);
assert.match(progressStyles, /\.al-detail-progress/);

assert.match(progressEditorSource, /\.al-volume-editor:not\(\.al-progress-unit-editor\)/);
assert.match(progressEditorSource, /originalEditor\) => originalEditor\.remove\(\)/);
assert.doesNotMatch(progressEditorSource, /originalEditor\.hidden/);
assert.match(progressEditorSource, /\.al-modal-actions > button\.mod-cta/);

assert.match(buildConfig, /readFile\("styles\.serial-reading\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.serial-cover\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.progress\.css", "utf8"\)/);
assert.match(buildConfig, /currentStyles\.indexOf\(GENERATED_STYLE_START\)/);
assert.match(buildConfig, /writeFile\("styles\.css", outputStyles, "utf8"\)/);

console.log("Serial reading, cover, and progress UI checks passed.");

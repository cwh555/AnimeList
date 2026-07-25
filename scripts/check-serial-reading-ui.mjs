import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serialStyles, coverStyles, progressStyles, buildConfig] = await Promise.all([
  readFile("styles.serial-reading.css", "utf8"),
  readFile("styles.serial-cover.css", "utf8"),
  readFile("styles.progress.css", "utf8"),
  readFile("esbuild.config.mjs", "utf8"),
]);

assert.match(serialStyles, /\.animelist-modal \.al-volume-editor \{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
assert.match(serialStyles, /\.al-volume-editor > \.al-secondary-button\s*\{[\s\S]*justify-self:\s*start;/);
assert.doesNotMatch(serialStyles, /display:\s*contents/);
assert.doesNotMatch(serialStyles, /grid-template-areas/);
assert.match(serialStyles, /\.al-volume-row-fields\s*\{[\s\S]*minmax\(96px,[\s\S]*repeat\(2,\s*minmax\(190px,/);
assert.match(serialStyles, /\.al-grid\.is-list \.al-progress\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
assert.doesNotMatch(serialStyles, /\.al-progress:not\(:has\(/);
assert.doesNotMatch(serialStyles, /\.status-(?:watching|reading|on_hold)/);

assert.match(coverStyles, /\.animelist-modal \.al-volume-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
assert.match(coverStyles, /\.al-serial-cover-button\s*\{[\s\S]*height:\s*102px;[\s\S]*width:\s*72px;/);
assert.match(coverStyles, /\.al-serial-cover-results\s*\{[\s\S]*grid-template-columns:/);

assert.match(progressStyles, /\.al-progress\.is-state-progress \.al-progress-fill/);
assert.match(progressStyles, /\.al-detail-progress/);
assert.match(progressStyles, /\.al-detail-actions\.has-detail-progress/);
assert.doesNotMatch(progressStyles, /:has\(/);

assert.match(buildConfig, /readFile\("styles\.serial-reading\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.serial-cover\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.progress\.css", "utf8"\)/);
assert.match(buildConfig, /currentStyles\.indexOf\(GENERATED_STYLE_START\)/);
assert.match(buildConfig, /writeFile\("styles\.css", outputStyles, "utf8"\)/);

console.log("Serial reading, cover, and progress UI checks passed.");

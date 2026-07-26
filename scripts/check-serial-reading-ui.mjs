import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  serialStyles,
  coverStyles,
  progressStyles,
  buildConfig,
  progressEditorSource,
  pickerSource,
  coverFeatureSource,
  coverSettingsSource,
  migrationModalSource,
  pluginEntrySource,
  packageSource,
] = await Promise.all([
  readFile("styles.serial-reading.css", "utf8"),
  readFile("styles.serial-cover.css", "utf8"),
  readFile("styles.progress.css", "utf8"),
  readFile("esbuild.config.mjs", "utf8"),
  readFile("src/additional-progress-units-ui.ts", "utf8"),
  readFile("src/serial-cover-picker.ts", "utf8"),
  readFile("src/serial-cover-feature.ts", "utf8"),
  readFile("src/serial-cover-settings.ts", "utf8"),
  readFile("src/serial-cover-migration-modal.ts", "utf8"),
  readFile("src/plugin-entry.ts", "utf8"),
  readFile("package.json", "utf8"),
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
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-result-use\s*\{[\s\S]*cursor:\s*pointer;/);
assert.match(coverStyles, /\.modal-container \.al-serial-cover-migration-modal/);
assert.match(coverStyles, /\.al-serial-cover-migration-status-card/);
assert.match(coverStyles, /\.al-serial-cover-migration-metrics/);
assert.match(coverStyles, /\.al-serial-cover-migration-progress/);
assert.doesNotMatch(coverStyles, /\.al-serial-cover-results/);

assert.match(progressStyles, /\.al-progress\.is-state-progress \.al-progress-fill/);
assert.match(progressStyles, /\.al-detail-progress/);

assert.match(progressEditorSource, /\.al-volume-editor:not\(\.al-progress-unit-editor\)/);
assert.match(progressEditorSource, /originalEditor\) => originalEditor\.remove\(\)/);
assert.doesNotMatch(progressEditorSource, /originalEditor\.hidden/);
assert.match(progressEditorSource, /\.al-modal-actions > button\.mod-cta/);

// The candidate picker must create a native Select button and route it directly to
// the modal's existing selection callback. No document-level event bridge is used.
assert.match(pickerSource, /row\.createEl\("button",\s*\{[\s\S]*cls:\s*"al-search-result-use"/);
assert.match(pickerSource, /selectButton\.type\s*=\s*"button"/);
assert.match(pickerSource, /selectButton\.addEventListener\("click",[\s\S]*options\.onSelect\(\)/);
assert.match(pickerSource, /row\.setAttribute\("aria-selected"/);
assert.match(coverFeatureSource, /renderSerialCoverCandidateRow\(results, candidate/);
assert.match(coverFeatureSource, /this\.selection\.select\(candidate\);[\s\S]*renderResults\(\);/);
assert.doesNotMatch(pluginEntrySource, /installSerialCoverPickerEvents/);

// The settings action opens a dedicated modal instead of rendering an inline
// progress/report block inside the settings row.
assert.match(coverSettingsSource, /new SerialCoverMigrationModal\(this\.plugin\)\.open\(\)/);
assert.doesNotMatch(coverSettingsSource, /createEl\("progress"/);
assert.match(migrationModalSource, /class SerialCoverMigrationModal extends Modal/);
assert.match(migrationModalSource, /createEl\("progress",\s*\{[\s\S]*al-serial-cover-migration-progress/);
assert.match(migrationModalSource, /new AbortController\(\)/);
assert.match(migrationModalSource, /this\.controller\.abort\(\)/);
assert.match(migrationModalSource, /formatSerialCoverMigrationReport\(summary\)/);

const packageJson = JSON.parse(packageSource);
assert.doesNotMatch(packageJson.scripts.test, /check-serial-cover-picker-click/);
assert.equal(
  packageJson.scripts["test:browser"],
  "ANIMELIST_REQUIRE_CHROMIUM=1 node scripts/check-serial-cover-picker-click.mjs",
);

assert.match(buildConfig, /readFile\("styles\.serial-reading\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.serial-cover\.css", "utf8"\)/);
assert.match(buildConfig, /readFile\("styles\.progress\.css", "utf8"\)/);
assert.match(buildConfig, /currentStyles\.indexOf\(GENERATED_STYLE_START\)/);
assert.match(buildConfig, /writeFile\("styles\.css", outputStyles, "utf8"\)/);

console.log("Serial reading, native cover picker, migration modal, and progress UI checks passed.");

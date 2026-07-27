import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  serialStyles,
  coverStyles,
  progressStyles,
  styleBundleSource,
  releaseStyles,
  progressEditorSource,
  segmentedDateSource,
  pickerSource,
  coverFeatureSource,
  migrationModalSource,
  pluginEntrySource,
  packageSource,
] = await Promise.all([
  readFile("styles.serial-reading.css", "utf8"),
  readFile("styles.serial-cover.css", "utf8"),
  readFile("styles.progress.css", "utf8"),
  readFile("scripts/style-bundle.mjs", "utf8"),
  readFile("styles.css", "utf8"),
  readFile("src/additional-progress-units-ui.ts", "utf8"),
  readFile("src/segmented-date-input.ts", "utf8"),
  readFile("src/serial-cover-picker.ts", "utf8"),
  readFile("src/serial-cover-feature.ts", "utf8"),
  readFile("src/serial-cover-migration-modal.ts", "utf8"),
  readFile("src/plugin-entry.ts", "utf8"),
  readFile("package.json", "utf8"),
]);

assert.match(serialStyles, /\.animelist-modal \.al-volume-editor \{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
assert.match(serialStyles, /\.al-volume-editor > \.al-secondary-button\s*\{[\s\S]*justify-self:\s*start;/);
assert.doesNotMatch(serialStyles, /display:\s*contents/);
assert.doesNotMatch(serialStyles, /grid-template-areas/);
assert.match(serialStyles, /\.al-volume-row-fields\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
assert.match(serialStyles, /@media \(max-width:\s*620px\)[\s\S]*\.al-volume-row-fields\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
assert.match(serialStyles, /\.al-grid\.is-list \.al-progress\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
assert.doesNotMatch(serialStyles, /\.al-progress:not\(:has\(/);
assert.doesNotMatch(serialStyles, /\.status-(?:watching|reading|on_hold)/);

assert.match(coverStyles, /\.animelist-modal \.al-volume-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/);
assert.match(coverStyles, /\.al-serial-cover-button\s*\{[\s\S]*height:\s*102px;[\s\S]*width:\s*72px;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-results\s*\{[\s\S]*overflow-y:\s*auto;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-result\s*\{[\s\S]*width:\s*100%;[\s\S]*text-align:\s*left;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-result:disabled\s*\{[\s\S]*cursor:\s*progress;/);
assert.match(coverStyles, /\.al-serial-cover-modal \.al-search-result\.is-applying\s*\{/);
assert.doesNotMatch(coverStyles, /al-search-result-use|is-selected/);
assert.match(coverStyles, /\.modal-container \.al-serial-cover-migration-modal/);
assert.match(coverStyles, /\.al-serial-cover-migration-status-card/);
assert.match(coverStyles, /\.al-serial-cover-migration-metrics/);
assert.match(coverStyles, /\.al-serial-cover-migration-progress/);
assert.doesNotMatch(coverStyles, /\.al-serial-cover-results/);

assert.match(progressStyles, /\.al-progress\.is-state-progress \.al-progress-fill/);
assert.match(progressStyles, /\.al-detail-progress/);
assert.match(progressStyles, /\.al-detail-actions\.has-detail-progress/);
assert.doesNotMatch(progressStyles, /:has\(/);

assert.match(progressEditorSource, /\.al-volume-editor:not\(\.al-progress-unit-editor\)/);
assert.match(progressEditorSource, /originalEditor\) => originalEditor\.remove\(\)/);
assert.doesNotMatch(progressEditorSource, /originalEditor\.hidden/);
assert.match(progressEditorSource, /\.al-modal-actions > button\.mod-cta/);
assert.match(progressEditorSource, /createSegmentedDateInput\(entry\.startedAt\)/);
assert.match(progressEditorSource, /createSegmentedDateInput\(entry\.completedAt \|\| todayString\(\)\)/);
assert.doesNotMatch(progressEditorSource, /\.type\s*=\s*"date"/);
assert.match(segmentedDateSource, /createDiv\(\{ cls: "al-date-input" \}\)/);
assert.match(segmentedDateSource, /bindSegment\(year, 4, month\)/);
assert.match(segmentedDateSource, /bindSegment\(month, 2, day\)/);
assert.match(segmentedDateSource, /bindSegment\(day, 2\)/);

// The whole candidate card is the only action. There is no Select affordance or
// secondary Apply button/state; clicking a card downloads, commits, and closes.
assert.match(pickerSource, /container\.createEl\("button",\s*\{[\s\S]*al-search-result/);
assert.match(pickerSource, /row\.type\s*=\s*"button"/);
assert.match(pickerSource, /row\.addEventListener\("click",\s*options\.onChoose\)/);
assert.doesNotMatch(pickerSource, /al-search-result-use|selectLabel|aria-selected/);
assert.match(coverFeatureSource, /directlyApplySerialCover\([\s\S]*downloadSelectedSerialCover[\s\S]*this\.applyCover[\s\S]*this\.close\(\)/);
assert.doesNotMatch(coverFeatureSource, /applyButton|SerialCoverSelection|this\.selection/);
assert.doesNotMatch(pluginEntrySource, /installSerialCoverPickerEvents/);

// Settings control behavior is covered by tests/serial-cover-settings.test.ts.
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

assert.match(styleBundleSource, /"styles\/base\.css"/);
assert.match(styleBundleSource, /"styles\.serial-reading\.css"/);
assert.match(styleBundleSource, /"styles\.serial-cover\.css"/);
assert.match(styleBundleSource, /"styles\.progress\.css"/);
assert.ok(releaseStyles.includes(serialStyles.trim()));
assert.ok(releaseStyles.includes(coverStyles.trim()));
assert.ok(releaseStyles.includes(progressStyles.trim()));

console.log("Serial reading, native cover picker, migration modal, and progress UI checks passed.");

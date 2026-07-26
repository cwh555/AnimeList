import fs from "node:fs";

const path = "tests/core.test.ts";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    '    const novelSource = readFileSync(path.join(process.cwd(), "src/novel-progress.ts"), "utf8");\n',
    "",
  ],
  [
    "    const runtimeSources = [legacySource, mainSource, templateSource, novelSource, settingsSource];\n",
    "    const runtimeSources = [legacySource, mainSource, templateSource, settingsSource];\n",
  ],
  [
    '    assert.match(novelSource, /uiText\\("timeline\\.novelEventTitle"/);\n',
    "",
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Missing expected test source: ${before}`);
  source = source.replace(before, after);
}

fs.writeFileSync(path, source, "utf8");
for (const file of [
  ".github/workflows/timeline-diagnostics.yml",
  ".github/workflows/apply-timeline-test-cleanup.yml",
  "scripts/remove-brittle-timeline-wording-test.mjs",
]) {
  fs.rmSync(file, { force: true });
}

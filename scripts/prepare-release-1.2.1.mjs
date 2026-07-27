import fs from "node:fs";

function replaceExact(path, from, to) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(from)) {
    throw new Error(`${path}: expected release marker was not found`);
  }
  fs.writeFileSync(path, source.replace(from, to));
}

replaceExact(
  "src/main.ts",
  'const PLUGIN_VERSION = "1.2.0";',
  'const PLUGIN_VERSION = "1.2.1";',
);
replaceExact(
  "src/legacy.ts",
  'const PLUGIN_VERSION = "1.2.0";',
  'const PLUGIN_VERSION = "1.2.1";',
);

let tests = fs.readFileSync("tests/core.test.ts", "utf8");
tests = tests.replace(
  'assert.match(changelog, /## 1\\.2\\.0 - 2026-07-26/);',
  'assert.match(changelog, /## 1\\.2\\.1 - 2026-07-27/);\n    assert.match(changelog, /## 1\\.2\\.0 - 2026-07-26/);',
);
tests = tests.replace(
  "> \\*\\*What's new in 1\\.2\\.0\\*\\*/",
  "> \\*\\*What's new in 1\\.2\\.1\\*\\*/",
);
tests = tests.replace(
  'assert.equal(manifest.version, "1.2.0");',
  'assert.equal(manifest.version, "1.2.1");',
);
tests = tests.replaceAll(
  'const PLUGIN_VERSION = "1\\.2\\.0";',
  'const PLUGIN_VERSION = "1\\.2\\.1";',
);
fs.writeFileSync("tests/core.test.ts", tests);

const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const releaseNotes = `# Changelog

## 1.2.1 - 2026-07-27

### Fixed

- Aligned manga and novel serial-entry start and completion date fields with the shared segmented date input and full-width editor layout.
- Prevented adding a chapter, season, or volume entry from jumping the modal or page before focusing the new unit field.
- Preserved the correct modal receiver when temporarily intercepting serial-cover modal opening, eliminating the unbound-method warning.
- Made list-mode covers and placeholders fill the complete row height while keeping cover metadata on one line.

### Compatibility

- No Markdown, frontmatter, progress-unit, serial-cover, or media-status schema changes are introduced in this patch release.

`;
if (!changelog.startsWith("# Changelog\n\n## 1.2.0")) {
  throw new Error("CHANGELOG.md: unexpected current release heading");
}
fs.writeFileSync("CHANGELOG.md", releaseNotes + changelog.slice("# Changelog\n\n".length));

let readme = fs.readFileSync("README.md", "utf8");
const currentNote = /> \[!NOTE\]\n> \*\*What's new in 1\.2\.0\*\*\n>[\s\S]*?\n\n## Features/;
const nextNote = `> [!NOTE]
> **What's new in 1.2.1**
>
> - Fixed manga and novel serial-entry date layout and standardized date input behavior.
> - Prevented newly added chapter, season, or volume rows from causing scroll jumps.
> - Fixed the serial-cover modal method binding warning without changing modal behavior.
> - Corrected list-mode cover sizing and kept cover status text on one line.

## Features`;
if (!currentNote.test(readme)) {
  throw new Error("README.md: current release note block was not found");
}
readme = readme.replace(currentNote, nextNote);
fs.writeFileSync("README.md", readme);

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const legacy = fs.readFileSync("src/legacy.ts", "utf8");
const expected = "1.2.1";
if (packageJson.version !== expected) throw new Error("package.json version mismatch");
if (packageLock.version !== expected || packageLock.packages[""]?.version !== expected) {
  throw new Error("package-lock.json version mismatch");
}
if (manifest.version !== expected) throw new Error("manifest.json version mismatch");
if (versions[expected] !== manifest.minAppVersion) throw new Error("versions.json entry mismatch");
if (!main.includes(`const PLUGIN_VERSION = "${expected}";`)) throw new Error("src/main.ts version mismatch");
if (!legacy.includes(`const PLUGIN_VERSION = "${expected}";`)) throw new Error("src/legacy.ts version mismatch");
if (!tests.includes('assert.equal(manifest.version, "1.2.1");')) throw new Error("version test mismatch");
if (!readme.includes("What's new in 1.2.1")) throw new Error("README release note mismatch");
if (!fs.readFileSync("CHANGELOG.md", "utf8").includes("## 1.2.1 - 2026-07-27")) {
  throw new Error("CHANGELOG release note mismatch");
}

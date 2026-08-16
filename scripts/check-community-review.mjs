import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectVersionMetadataFailures, loadVersionMetadata } from "./version-metadata.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const versionMetadata = loadVersionMetadata(root);
const { manifest } = versionMetadata;
const sourceFiles = walk(path.join(root, "src"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const main = read("src/main.ts");
const settings = read("src/ui/settings.ts");
const scopedVault = read("src/data/vault-scope.ts");
const shim = read("types/obsidian.d.ts");
const styles = read("styles.css");
const releaseWorkflow = read(".github/workflows/release.yml");

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) failures.push(message);
}
function rejectMatch(value, pattern, message) {
  if (pattern.test(value)) failures.push(message);
}

failures.push(...collectVersionMetadataFailures(versionMetadata));

rejectMatch(sourceFiles, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/, "unsafe HTML assignment remains");
rejectMatch(sourceFiles, /document\.create(?:Element|DocumentFragment|TextNode)\s*\(/, "native DOM creation remains; use Obsidian createEl helpers");
rejectMatch(main, /detachLeavesOfType\s*\(/, "custom views must not be detached during unload");
rejectMatch(settings, /setName\(["']AnimeList["']\)\.setHeading\(\)/, "plugin name must not be a settings heading");
rejectMatch(sourceFiles, /\.getMarkdownFiles\s*\(|\.getFiles\s*\(/, "whole-vault file enumeration remains");
rejectMatch(scopedVault, /\bas\s+(?:TAbstractFile|TFile|TFolder)\b/, "vault traversal must use instanceof narrowing instead of file casts");
rejectMatch(sourceFiles, /eslint-disable/, "source lint suppressions remain");
rejectMatch(main, /\bany\b/, "explicit any remains in src/main.ts");
rejectMatch(shim, /\bany\b/, "explicit any remains in types/obsidian.d.ts");
requireMatch(settings, /getSettingDefinitions\(\):\s*SettingDefinition\[\]/, "declarative settings definitions are missing");
rejectMatch(styles, /!important\b|stylelint-disable/, "CSS suppression remains");
rejectMatch(
  styles,
  /(?:^|[;{}])\s*(?:columns|column-count|column-width|column-fill|column-span|column-gap|column-rule(?:-[a-z-]+)?|break-inside)\s*:/m,
  "CSS multi-column or fragmentation properties remain; use baseline Grid/Flexbox for the minimum Obsidian browser target",
);
rejectMatch(
  styles,
  /(?:scrollbar-(?:width|color)\s*:|::?-webkit-scrollbar(?:-[a-z-]+)?)/,
  "partially supported custom scrollbar CSS remains; use native overflow scrollbars instead",
);
requireMatch(releaseWorkflow, /actions\/attest@v4/, "release artifact attestation is missing");
requireMatch(releaseWorkflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/, "all release assets must be attested");

if (failures.length) {
  console.error("Community review preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Community review preflight passed.");

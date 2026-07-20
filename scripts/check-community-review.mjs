import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const manifest = JSON.parse(read("manifest.json"));
const packageJson = JSON.parse(read("package.json"));
const versions = JSON.parse(read("versions.json"));
const legacy = read("src/legacy.ts");
const main = read("src/main.ts");
const settings = read("src/settings.ts");
const scopedVault = read("src/vault-scope.ts");
const shim = read("types/obsidian.d.ts");
const styles = read("styles.css");
const releaseWorkflow = read(".github/workflows/release.yml");
const sourceFiles = [legacy, main, settings, scopedVault].join("\n");

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) failures.push(message);
}

function rejectMatch(value, pattern, message) {
  if (pattern.test(value)) failures.push(message);
}

if (manifest.version !== "1.0.2" || packageJson.version !== "1.0.2") {
  failures.push("Community release version must remain 1.0.2");
}
if (versions["1.0.2"] !== manifest.minAppVersion) {
  failures.push("versions.json must map 1.0.2 to manifest minAppVersion");
}

rejectMatch(sourceFiles, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/, "unsafe HTML assignment remains");
rejectMatch(main, /detachLeavesOfType\s*\(/, "custom views must not be detached during unload");
rejectMatch(settings, /setName\(["']AnimeList["']\)\.setHeading\(\)/, "plugin name must not be a settings heading");
rejectMatch(sourceFiles, /\.getMarkdownFiles\s*\(|\.getFiles\s*\(/, "whole-vault file enumeration remains");

requireMatch(legacy, /eslint-disable[^\n]*@typescript-eslint\/no-unsafe-return/, "legacy compatibility lint boundary is missing");
requireMatch(legacy, /eslint-disable[^\n]*obsidianmd\/prefer-create-el/, "legacy DOM helper lint boundary is missing");
requireMatch(main, /eslint-disable[^\n]*@typescript-eslint\/no-explicit-any/, "typed adapter lint boundary is missing");
requireMatch(settings, /obsidianmd\/settings-tab\/prefer-setting-definitions/, "pre-1.13 settings compatibility policy is missing");
requireMatch(shim, /eslint-disable[^\n]*@typescript-eslint\/no-explicit-any/, "compile-time shim lint policy is missing");
requireMatch(styles, /stylelint-disable declaration-no-important/, "scoped host-style override policy is missing");
requireMatch(releaseWorkflow, /actions\/attest@v4/, "release artifact attestation is missing");
requireMatch(releaseWorkflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/, "all release assets must be attested");

if (failures.length) {
  console.error("Community review preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Community review preflight passed.");

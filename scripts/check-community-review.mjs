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

function requirePairedLintScope(value, rules, label) {
  const escaped = rules.map((rule) => rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const sequence = escaped.join(",\\s*");
  requireMatch(value, new RegExp(`/\\* eslint-disable\\s+${sequence}\\s+--[^*]+\\*/`), `${label} eslint-disable scope is missing or changed`);
  requireMatch(value, new RegExp(`/\\* eslint-enable\\s+${sequence}\\s+--[^*]+\\*/`), `${label} eslint-enable scope is missing or changed`);
}

if (manifest.version !== "1.0.2" || packageJson.version !== "1.0.2") {
  failures.push("Community release version must remain 1.0.2");
}
if (versions["1.0.2"] !== manifest.minAppVersion) {
  failures.push("versions.json must map 1.0.2 to manifest minAppVersion");
}

rejectMatch(sourceFiles, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/, "unsafe HTML assignment remains");
rejectMatch(sourceFiles, /document\.create(?:Element|DocumentFragment|TextNode)\s*\(/, "native DOM creation remains; use Obsidian createEl helpers");
rejectMatch(main, /detachLeavesOfType\s*\(/, "custom views must not be detached during unload");
rejectMatch(settings, /setName\(["']AnimeList["']\)\.setHeading\(\)/, "plugin name must not be a settings heading");
rejectMatch(sourceFiles, /\.getMarkdownFiles\s*\(|\.getFiles\s*\(/, "whole-vault file enumeration remains");
rejectMatch(scopedVault, /\bas\s+(?:TAbstractFile|TFile|TFolder)\b/, "vault traversal must use instanceof narrowing instead of file casts");

const forbiddenDisabledRules = [
  "@typescript-eslint/no-explicit-any",
  "obsidianmd/prefer-create-el",
  "obsidianmd/settings-tab/prefer-setting-definitions",
];
for (const rule of forbiddenDisabledRules) {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  rejectMatch([legacy, main, settings, shim].join("\n"), new RegExp(`eslint-disable[^\\n]*${escaped}`), `forbidden lint suppression remains: ${rule}`);
}
rejectMatch(main, /\bany\b/, "explicit any remains in src/main.ts");
rejectMatch(shim, /\bany\b/, "explicit any remains in types/obsidian.d.ts");
requireMatch(settings, /getSettingDefinitions\(\):\s*SettingDefinition\[\]/, "declarative settings definitions are missing");
rejectMatch(styles, /!important\b/, "CSS !important remains");

requirePairedLintScope(legacy, [
  "@typescript-eslint/no-unsafe-return",
  "@typescript-eslint/no-unsafe-member-access",
  "@typescript-eslint/no-unsafe-call",
  "@typescript-eslint/no-unsafe-argument",
  "@typescript-eslint/no-unsafe-assignment",
  "@typescript-eslint/no-floating-promises",
  "@typescript-eslint/no-misused-promises",
], "legacy compatibility");
requirePairedLintScope(main, [
  "@typescript-eslint/no-unsafe-member-access",
  "@typescript-eslint/no-unsafe-assignment",
  "@typescript-eslint/no-misused-promises",
], "typed legacy adapter");

requireMatch(releaseWorkflow, /actions\/attest@v4/, "release artifact attestation is missing");
requireMatch(releaseWorkflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/, "all release assets must be attested");

if (failures.length) {
  console.error("Community review preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Community review preflight passed.");

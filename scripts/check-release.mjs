import fs from "node:fs";
import process from "node:process";
import {
  collectVersionMetadataFailures,
  loadVersionMetadata,
} from "./version-metadata.mjs";

const metadata = loadVersionMetadata();
const { manifest, version } = metadata;
const explicitTag = process.argv[2] || "";
const githubTag = process.env.GITHUB_REF_TYPE === "tag"
  ? process.env.GITHUB_REF_NAME || ""
  : "";
const tag = explicitTag || githubTag;

const failures = collectVersionMetadataFailures(metadata);
if (tag && tag !== version) failures.push(`release tag ${tag} must exactly equal ${version} (no v prefix)`);
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  if (!fs.existsSync(file)) failures.push(`${file} is missing`);
}
if (fs.existsSync("main.js")) {
  const mainJs = fs.readFileSync("main.js", "utf8");
  if (!mainJs.includes(version)) {
    failures.push("main.js is stale; run npm run build before releasing");
  }
}
if (fs.existsSync("CHANGELOG.md")) {
  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!new RegExp(`^## ${escapedVersion}(?:\\s+-|\\s*$)`, "mu").test(changelog)) {
    failures.push(`CHANGELOG.md has no release section for ${version}`);
  }
} else {
  failures.push("CHANGELOG.md is missing");
}
if (manifest.id !== "animelist") failures.push("manifest id must remain animelist after community publication");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Release ${version} is ready.`);

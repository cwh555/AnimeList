import fs from "node:fs";
import process from "node:process";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const tag = process.env.GITHUB_REF_NAME || process.argv[2] || "";

const failures = [];
if (manifest.version !== packageJson.version) failures.push("manifest.json and package.json versions differ");
if (!versions[manifest.version]) failures.push(`versions.json has no entry for ${manifest.version}`);
if (tag && tag !== manifest.version) failures.push(`release tag ${tag} must exactly equal ${manifest.version} (no v prefix)`);
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  if (!fs.existsSync(file)) failures.push(`${file} is missing`);
}
if (fs.existsSync("main.js")) {
  const mainJs = fs.readFileSync("main.js", "utf8");
  if (!mainJs.includes(manifest.version)) {
    failures.push("main.js is stale; run npm run build before releasing");
  }
}
if (manifest.id !== "animelist") failures.push("manifest id must remain animelist after community publication");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Release ${manifest.version} is ready.`);

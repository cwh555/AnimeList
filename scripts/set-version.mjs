import fs from "node:fs";
import process from "node:process";
import { isReleaseVersion, syncVersionMetadata, VERSION_SOURCE_FILE } from "./version-metadata.mjs";

const requestedVersion = process.argv[2] || "";
if (!isReleaseVersion(requestedVersion)) {
  console.error("Usage: npm run release:version -- <x.y.z>");
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(VERSION_SOURCE_FILE, "utf8"));
packageJson.version = requestedVersion;
fs.writeFileSync(VERSION_SOURCE_FILE, `${JSON.stringify(packageJson, null, 2)}\n`);

const { version, minAppVersion } = syncVersionMetadata();
console.log(`Set AnimeList release version to ${version} (Obsidian >= ${minAppVersion}).`);

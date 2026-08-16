import { syncVersionMetadata } from "./version-metadata.mjs";

const { version, minAppVersion } = syncVersionMetadata();
console.log(`Synchronized release metadata to ${version} (Obsidian >= ${minAppVersion}).`);

import fs from "node:fs";
import path from "node:path";

export const VERSION_SOURCE_FILE = "package.json";
export const VERSION_DERIVED_FILES = ["package-lock.json", "manifest.json", "versions.json"];

const RELEASE_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function readJson(root, file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function writeJson(root, file, value) {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

export function isReleaseVersion(version) {
  return typeof version === "string" && RELEASE_VERSION_PATTERN.test(version);
}

export function loadVersionMetadata(root = process.cwd()) {
  const packageJson = readJson(root, VERSION_SOURCE_FILE);
  const packageLock = readJson(root, "package-lock.json");
  const manifest = readJson(root, "manifest.json");
  const versions = readJson(root, "versions.json");
  return {
    root,
    version: packageJson.version,
    packageJson,
    packageLock,
    manifest,
    versions,
  };
}

export function collectVersionMetadataFailures(metadata) {
  const failures = [];
  const { version, packageLock, manifest, versions } = metadata;

  if (!isReleaseVersion(version)) {
    failures.push(`package.json version must be a stable x.y.z release version (found ${JSON.stringify(version)})`);
    return failures;
  }
  if (packageLock.version !== version) {
    failures.push(`package-lock.json version ${packageLock.version ?? "<missing>"} must match package.json ${version}`);
  }
  if (packageLock.packages?.[""]?.version !== version) {
    failures.push(`package-lock.json root package version ${packageLock.packages?.[""]?.version ?? "<missing>"} must match package.json ${version}`);
  }
  if (manifest.version !== version) {
    failures.push(`manifest.json version ${manifest.version ?? "<missing>"} must match package.json ${version}`);
  }
  if (versions[version] !== manifest.minAppVersion) {
    failures.push(`versions.json must map ${version} to manifest minAppVersion ${manifest.minAppVersion}`);
  }

  return failures;
}

export function syncVersionMetadata(root = process.cwd()) {
  const metadata = loadVersionMetadata(root);
  const { version, packageLock, manifest, versions } = metadata;

  if (!isReleaseVersion(version)) {
    throw new Error(`package.json version must be a stable x.y.z release version (found ${JSON.stringify(version)})`);
  }
  if (!packageLock.packages?.[""]) {
    throw new Error("package-lock.json is missing the root package entry");
  }
  if (typeof manifest.minAppVersion !== "string" || !manifest.minAppVersion.trim()) {
    throw new Error("manifest.json minAppVersion must be a non-empty string");
  }

  packageLock.version = version;
  packageLock.packages[""].version = version;
  manifest.version = version;
  versions[version] = manifest.minAppVersion;

  writeJson(root, "package-lock.json", packageLock);
  writeJson(root, "manifest.json", manifest);
  writeJson(root, "versions.json", versions);

  return { version, minAppVersion: manifest.minAppVersion };
}

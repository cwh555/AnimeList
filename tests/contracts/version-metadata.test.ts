import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { PLUGIN_VERSION } from "../../src/app-metadata";
import {
  collectVersionMetadataFailures,
  loadVersionMetadata,
} from "../../scripts/version-metadata.mjs";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function createVersionFixture(): string {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "animelist-version-"));
  mkdirSync(path.join(fixture, "scripts"), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "manifest.json", "versions.json"]) {
    cpSync(path.join(root, file), path.join(fixture, file));
  }
  for (const file of ["set-version.mjs", "version-bump.mjs", "version-metadata.mjs"]) {
    cpSync(path.join(root, "scripts", file), path.join(fixture, "scripts", file));
  }
  return fixture;
}

describe("release version metadata", () => {
  it("uses package.json as the single runtime and release metadata source", () => {
    const metadata = loadVersionMetadata(root);
    assert.deepEqual(collectVersionMetadataFailures(metadata), []);
    assert.equal(PLUGIN_VERSION, metadata.version);
  });

  it("sets every derived version field from one release-version argument", () => {
    const fixture = createVersionFixture();
    try {
      const result = spawnSync(
        npmCommand,
        ["run", "release:version", "--", "9.8.7"],
        { cwd: fixture, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const packageJson = readJson<{ version: string }>(path.join(fixture, "package.json"));
      const packageLock = readJson<{ version: string; packages: Record<string, { version?: string }> }>(path.join(fixture, "package-lock.json"));
      const manifest = readJson<{ version: string; minAppVersion: string }>(path.join(fixture, "manifest.json"));
      const versions = readJson<Record<string, string>>(path.join(fixture, "versions.json"));

      assert.equal(packageJson.version, "9.8.7");
      assert.equal(packageLock.version, "9.8.7");
      assert.equal(packageLock.packages[""]?.version, "9.8.7");
      assert.equal(manifest.version, "9.8.7");
      assert.equal(versions["9.8.7"], manifest.minAppVersion);
      assert.equal(versions["1.4.0"], "1.5.0");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("can resynchronize derived metadata after editing only package.json", () => {
    const fixture = createVersionFixture();
    try {
      const packagePath = path.join(fixture, "package.json");
      const packageJson = readJson<Record<string, unknown>>(packagePath);
      packageJson.version = "9.8.6";
      writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

      const result = spawnSync(npmCommand, ["run", "version:sync"], { cwd: fixture, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.deepEqual(collectVersionMetadataFailures(loadVersionMetadata(fixture)), []);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

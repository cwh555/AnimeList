import { build, stop } from "esbuild";
import { builtinModules } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  parseTestArguments,
  selectTestTargets,
} from "./test-selection.mjs";
import {
  TEST_FEATURES,
  TEST_SUITES,
  TEST_TARGETS,
} from "../tests/test-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".tmp", "tests");

function printCatalog(targets) {
  for (const suite of TEST_SUITES) {
    const entries = targets.filter((target) => target.suite === suite);
    if (!entries.length) continue;
    console.log(`\n${suite}`);
    for (const target of entries) {
      console.log(`  ${target.kind.padEnd(6)} ${target.path} [${target.features.join(", ")}]`);
    }
  }
}

function run(command, arguments_, label) {
  const result = spawnSync(command, arguments_, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status ?? "unknown"}`);
}

const filters = parseTestArguments(process.argv.slice(2), TEST_SUITES, TEST_FEATURES);
const targets = selectTestTargets(TEST_TARGETS, filters);
if (!targets.length) throw new Error("No tests matched the requested filters");
if (filters.list) {
  printCatalog(targets);
  process.exit(0);
}

for (const target of targets) {
  if (!existsSync(path.join(root, target.path))) throw new Error(`Missing test target: ${target.path}`);
}

const testTargets = targets.filter((target) => target.kind === "test");
const scriptTargets = targets.filter((target) => target.kind === "script");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
try {
  if (testTargets.length) {
    const entryPoints = testTargets.map((target) => path.join(root, target.path));
    await build({
      absWorkingDir: root,
      entryPoints,
      outdir: outputDir,
      outbase: root,
      entryNames: "[dir]/[name]",
      outExtension: { ".js": ".mjs" },
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node18",
      alias: { obsidian: path.join(root, "tests", "mocks", "obsidian.ts") },
      external: builtinModules.flatMap((name) => [name, `node:${name}`]),
      logLevel: "warning",
    });
    const outputFiles = testTargets.map((target) => path.join(
      outputDir,
      target.path.replace(/\.ts$/, ".mjs"),
    ));
    run(process.execPath, ["--test", "--test-concurrency=1", ...outputFiles], "Node test suites");
  }

  for (const target of scriptTargets) {
    run(process.execPath, [target.path], target.path);
  }
} finally {
  stop();
  await rm(outputDir, { recursive: true, force: true });
}

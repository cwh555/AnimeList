import { build, stop } from "esbuild";
import { builtinModules } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".tmp", "tests");
const outputFile = path.join(outputDir, "core.test.mjs");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

try {
  await build({
    absWorkingDir: root,
    entryPoints: ["tests/core.test.ts"],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    alias: {
      obsidian: path.join(root, "tests", "mocks", "obsidian.ts"),
    },
    external: builtinModules.flatMap((name) => [name, `node:${name}`]),
    logLevel: "warning",
  });

  const result = spawnSync(process.execPath, ["--test", outputFile], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  stop();
  await rm(outputDir, { recursive: true, force: true });
}

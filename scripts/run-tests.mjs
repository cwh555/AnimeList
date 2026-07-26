import { build, stop } from "esbuild";
import { builtinModules } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".tmp", "tests");
const entryFile = path.join(outputDir, "entry.ts");
const outputFile = path.join(outputDir, "tests.mjs");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(entryFile, [
  'import "../../tests/core.test.ts";',
  'import "../../tests/media-status.test.ts";',
  'import "../../tests/schema-migration.test.ts";',
  'import "../../tests/progress-display.test.ts";',
  'import "../../tests/search-pagination.test.ts";',
  'import "../../tests/cover-cache.test.ts";',
  'import "../../tests/multilingual-search.test.ts";',
  'import "../../tests/duplicate-detection.test.ts";',
  'import "../../tests/library-navigation.test.ts";',
  'import "../../tests/search-settings.test.ts";',
  'import "../../tests/timeline-scale.test.ts";',
  'import "../../tests/timeline-scale-work-items.test.ts";',
  'import "../../tests/timeline-corrections.test.ts";',
  'import "../../tests/rating.test.ts";',
  'import "../../tests/progress-units.test.ts";',
  'import "../../tests/masterpiece-labels.test.ts";',
  'import "../../tests/score-dashboard.test.ts";',
  'import "../../tests/score-dashboard-selection.test.ts";',
  'import "../../tests/score-dashboard-drag-scroll.test.ts";',
  'import "../../tests/serial-entry-cover.test.ts";',
  'import "../../tests/serial-cover-workflow.test.ts";',
  'import "../../tests/serial-cover-settings.test.ts";',
  'import "../../tests/serial-cover-migration-modal.test.ts";',
  "",
].join("\n"));
try {
  await build({ absWorkingDir: root, entryPoints: [entryFile], outfile: outputFile, bundle: true, platform: "node", format: "esm", target: "node18", alias: { obsidian: path.join(root, "tests", "mocks", "obsidian.ts") }, external: builtinModules.flatMap((name) => [name, `node:${name}`]), logLevel: "warning" });
  const result = spawnSync(process.execPath, ["--test", outputFile], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { stop(); await rm(outputDir, { recursive: true, force: true }); }

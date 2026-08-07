import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildStyleBundle, STYLE_SOURCES } from "./style-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
const check = arguments_.includes("--check");
const writeRelease = arguments_.includes("--write");
const watchMode = arguments_.includes("--watch");
const outputIndex = arguments_.indexOf("--output");
const outputArgument = outputIndex >= 0 ? arguments_[outputIndex + 1] : "";

if (outputIndex >= 0 && !outputArgument) throw new Error("--output requires a path");
if ([check, writeRelease, Boolean(outputArgument)].filter(Boolean).length !== 1) {
  throw new Error("Choose exactly one of --check, --write, or --output <path>");
}
if (check && watchMode) throw new Error("--check cannot be combined with --watch");

const outputPath = path.resolve(
  repoRoot,
  writeRelease || check ? "styles.css" : outputArgument,
);

async function writeBundle() {
  const bundle = await buildStyleBundle(repoRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bundle, "utf8");
  console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
}

async function checkBundle() {
  const [expected, actual] = await Promise.all([
    buildStyleBundle(repoRoot),
    readFile(outputPath, "utf8"),
  ]);
  if (actual !== expected) {
    throw new Error("styles.css is not reproducible. Run `npm run styles:build` and commit the result.");
  }
  console.log("styles.css is reproducible from independent source stylesheets.");
}

if (check) {
  await checkBundle();
} else {
  await writeBundle();
}

if (watchMode) {
  let pending = null;
  let building = false;
  let rebuildRequested = false;

  const rebuild = async () => {
    if (building) {
      rebuildRequested = true;
      return;
    }
    building = true;
    try {
      await writeBundle();
    } catch (error) {
      console.error(error);
    } finally {
      building = false;
      if (rebuildRequested) {
        rebuildRequested = false;
        void rebuild();
      }
    }
  };

  for (const source of STYLE_SOURCES) {
    watch(path.join(repoRoot, source), () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => void rebuild(), 50);
    });
  }
  console.log(`Watching ${STYLE_SOURCES.length} stylesheet sources...`);
  await new Promise(() => undefined);
}

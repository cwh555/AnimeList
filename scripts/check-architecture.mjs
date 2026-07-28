import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourcePaths = walk(path.join(root, "src"))
  .filter((file) => file.endsWith(".ts"))
  .sort();
const sources = sourcePaths.map((file) => ({
  path: path.relative(root, file).replaceAll(path.sep, "/"),
  content: fs.readFileSync(file, "utf8"),
}));
const joined = sources.map(({ path: file, content }) => `// ${file}\n${content}`).join("\n");
const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
const entry = fs.readFileSync(path.join(root, "src/plugin-entry.ts"), "utf8");
const legacy = fs.readFileSync(path.join(root, "src/legacy.ts"), "utf8");
const featureAndUiSources = sources
  .filter(({ path: file }) => (
    !file.startsWith("src/data/")
    && !/(?:-service|-persistence|schema-migration)\.ts$/.test(file)
  ))
  .map(({ content }) => content)
  .join("\n");

function reject(pattern, message, value = joined) {
  if (pattern.test(value)) failures.push(message);
}
function require(pattern, message, value) {
  if (!pattern.test(value)) failures.push(message);
}

reject(/\bModal\.prototype\b/, "Modal.prototype patching is forbidden");
reject(/\.prototype\.[A-Za-z_$][\w$]*\s*=/, "prototype method replacement is forbidden");
reject(/fileManager\.processFrontMatter\s*=/, "processFrontMatter replacement is forbidden");
reject(
  /fileManager\.processFrontMatter\s*\(/,
  "feature and UI modules must delegate frontmatter persistence to typed services",
  featureAndUiSources,
);
reject(/\.(?:openAddModal|openEditModal|collectMediaItems|createMediaNote|setFavorite|renderLibrary)\s*=/, "plugin or renderer method replacement is forbidden");
reject(/new\s+MutationObserver\b/, "feature integration must not discover forms through MutationObserver");
reject(/^import\s+["'][^"']+["'];?\s*$/m, "side-effect-only feature imports are forbidden", entry);
reject(/from\s+["'][^"']*(?:compat\/legacy-ui|\/legacy|\.\/legacy)["']/, "active source must not import the compatibility UI barrel", sources.filter(({ path: file }) => file !== "src/legacy.ts").map(({ content }) => content).join("\n"));
reject(/eslint-disable/, "active source must not require eslint suppression");
require(/class\s+AnimeListPlugin\s+extends\s+Plugin\b/, "main plugin must extend Obsidian Plugin directly", main);
reject(/extends\s+LegacyAnimeListPlugin\b/, "main plugin must not inherit the legacy plugin", main);
reject(/from\s+["\']\.\/data\//, "main.ts must delegate data services through the application service", main);
require(/AnimeListApplicationServices/, "main.ts must delegate through the typed application service", main);
require(/const\s+FEATURES\s*:/, "plugin entry must declare one feature manifest", entry);
require(/featureManifest\(\)/, "plugin entry must expose the feature manifest through the host lifecycle", entry);

const legacyLines = legacy.trim().split(/\r?\n/).length;
if (legacyLines > 25) failures.push(`src/legacy.ts must remain a thin compatibility barrel (found ${legacyLines} lines)`);
reject(/\bclass\b|\bfunction\b/, "src/legacy.ts must not contain active implementations", legacy);

if (failures.length) {
  console.error("Architecture boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Architecture boundary check passed.");

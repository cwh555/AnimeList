import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

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
const libraryRenderer = fs.readFileSync(path.join(root, "src/ui/library-renderer.ts"), "utf8");
const libraryWorkspaceLayout = fs.readFileSync(path.join(root, "src/ui/library-workspace-layout.ts"), "utf8");
const pointerDrag = fs.readFileSync(path.join(root, "src/ui/pointer-drag.ts"), "utf8");
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
reject(
  /new\s+MutationObserver\b/,
  "feature integration must not discover forms through MutationObserver",
  sources.filter(({ path: file }) => file !== "src/ui/image-section-continuity.ts").map(({ content }) => content).join("\n"),
);
reject(/^import\s+["'][^"']+["'];?\s*$/m, "side-effect-only feature imports are forbidden", entry);
reject(/from\s+["'][^"']*(?:compat\/legacy-ui|\/legacy|\.\/legacy)["']/, "active source must not import the compatibility UI barrel", sources.filter(({ path: file }) => file !== "src/legacy.ts").map(({ content }) => content).join("\n"));
reject(/eslint-disable/, "active source must not require eslint suppression");
reject(
  /workspaceActionHost|al-workspace-page-actions/,
  "generic Library renderer must not own or mutate Workspace header actions",
  libraryRenderer,
);
reject(
  /\.closest(?:<[^>]+>)?\([^)]*al-workspace|querySelector(?:<[^>]+>)?\([^)]*al-workspace-page-actions/,
  "Library workspace layout must receive Workspace-owned action slots explicitly instead of discovering ancestors",
  libraryWorkspaceLayout,
);
reject(
  /cloneNode\s*\(/,
  "pointer drag must not clone whole media/card DOM surfaces; keep the original node and use explicit drop indicators",
  pointerDrag,
);

// Every user-facing image element needs an explicit load-failure contract. This
// prevents one component from leaking browser broken-image UI while another
// silently removes the image. Internal raster decoding is intentionally excluded.
const imageCreationPattern = /(?:\b(?:makeEl|createEl|makeElement|create|el)\(\s*["']img["']|\.createEl\(\s*["']img["']|document\.createElement\(\s*["']img["']|new\s+Image\s*\()/g;
const imageFailurePattern = /(?:\bbindImageFallback\s*\(|addEventListener\(\s*["']error["']|\.onerror\s*=)/g;
for (const source of sources) {
  if (!(source.path.startsWith("src/ui/") || source.path.startsWith("src/features/"))) continue;
  const imageCreations = source.content.match(imageCreationPattern)?.length ?? 0;
  if (!imageCreations) continue;
  const failureContracts = source.content.match(imageFailurePattern)?.length ?? 0;
  if (failureContracts < imageCreations) {
    failures.push(`every user-facing image creation needs its own explicit failure contract (${source.path}: ${imageCreations} image creation(s), ${failureContracts} failure contract(s))`);
  }
}
require(/class\s+AnimeListPlugin\s+extends\s+Plugin\b/, "main plugin must extend Obsidian Plugin directly", main);
reject(/extends\s+LegacyAnimeListPlugin\b/, "main plugin must not inherit the legacy plugin", main);
reject(/from\s+["\']\.\/data\//, "main.ts must delegate data services through the application service", main);
require(/AnimeListApplicationServices/, "main.ts must delegate through the typed application service", main);
require(/const\s+FEATURES\s*:/, "plugin entry must declare one feature manifest", entry);
require(/featureManifest\(\)/, "plugin entry must expose the feature manifest through the host lifecycle", entry);

const legacyLines = legacy.trim().split(/\r?\n/).length;
if (legacyLines > 25) failures.push(`src/legacy.ts must remain a thin compatibility barrel (found ${legacyLines} lines)`);
reject(/\bclass\b|\bfunction\b/, "src/legacy.ts must not contain active implementations", legacy);


const ROOT_SOURCE_ALLOWLIST = new Set([
  "app-metadata.ts",
  "legacy.ts",
  "main.ts",
  "plugin-entry.ts",
  "types.ts",
  "ui-text.ts",
]);
const sourceRootEntries = fs.readdirSync(path.join(root, "src"), { withFileTypes: true });
for (const entry of sourceRootEntries) {
  if (entry.isFile() && entry.name.endsWith(".ts") && !ROOT_SOURCE_ALLOWLIST.has(entry.name)) {
    failures.push(`src root must contain only entry/compat surfaces (found ${entry.name})`);
  }
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && /^styles\..+\.css$/u.test(entry.name)) {
    failures.push(`feature stylesheet sources must live under styles/ (found ${entry.name})`);
  }
}

const sourceByPath = new Map(sources.map((source) => [source.path, source]));

function resolveSourceImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const importerDirectory = path.posix.dirname(importerPath);
  const normalized = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  const candidates = [normalized, `${normalized}.ts`, `${normalized}/index.ts`];
  return candidates.find((candidate) => sourceByPath.has(candidate)) ?? null;
}

function sourceDependencies(source) {
  const parsed = ts.createSourceFile(
    source.path,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const dependencies = new Set();
  let definesFeature = false;
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveSourceImport(source.path, node.moduleSpecifier.text);
      if (target) dependencies.add(target);
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const target = resolveSourceImport(source.path, node.arguments[0].text);
        if (target) dependencies.add(target);
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === "defineFeature") definesFeature = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return { dependencies, definesFeature };
}

const dependencyGraph = new Map();
for (const source of sources) {
  const { dependencies, definesFeature } = sourceDependencies(source);
  dependencyGraph.set(source.path, dependencies);
  if (definesFeature && source.path !== "src/app/feature-types.ts" && !source.path.startsWith("src/features/")) {
    failures.push(`feature definitions must live under src/features/ (found ${source.path})`);
  }
  if (source.path.startsWith("src/domain/")) {
    for (const dependency of dependencies) {
      if (dependency.startsWith("src/app/")
        || dependency.startsWith("src/data/")
        || dependency.startsWith("src/ui/")
        || dependency.startsWith("src/features/")) {
        failures.push(`domain modules must not depend on higher layers (${source.path} -> ${dependency})`);
      }
    }
  }
}

function forbidDependency(importer, dependency, message) {
  if (dependencyGraph.get(importer)?.has(dependency)) failures.push(message);
}
function requireDependency(importer, dependency, message) {
  if (!dependencyGraph.get(importer)?.has(dependency)) failures.push(message);
}

// Image Section move persistence and visual continuity are intentionally
// independent state machines. Persistence may adopt replacement participants,
// but it must never own DOM snapshots or renderer visual readiness.
forbidDependency(
  "src/ui/image-section-move-commit-queue.ts",
  "src/ui/image-section-continuity.ts",
  "Image Section move commit queue must not depend on visual continuity",
);
for (const dependency of [
  "src/ui/image-section-move-commit-queue.ts",
  "src/ui/image-section-move-lifecycle.ts",
  "src/ui/image-section-drag-controller.ts",
  "src/data/image-section-service.ts",
]) {
  forbidDependency(
    "src/ui/image-section-continuity.ts",
    dependency,
    `Image Section continuity must stay independent of move/persistence wiring (${dependency})`,
  );
}
requireDependency(
  "src/ui/image-section-continuity.ts",
  "src/ui/image-section-visual-handoff.ts",
  "Image Section continuity must delegate DOM snapshot/readiness to image-section-visual-handoff",
);
requireDependency(
  "src/ui/image-section-renderer.ts",
  "src/ui/image-section-continuity.ts",
  "Image Section renderer must own the prepare/claim lifecycle wiring",
);
const visualHandoff = sourceByPath.get("src/ui/image-section-visual-handoff.ts")?.content ?? "";
reject(
  /document\.body\.(?:append|appendChild)\s*\(/,
  "Image Section visual handoff must stay inside the Markdown ancestor context",
  visualHandoff,
);
reject(
  /cloneNode\(\s*true\s*\)/,
  "Image Section visual handoff must preserve painted descendants instead of deep-cloning them",
  visualHandoff,
);
const imageSectionLifecycle = sourceByPath.get("src/ui/image-section-move-lifecycle.ts")?.content ?? "";
reject(
  /participantUnloading|unloadImageSectionMoveParticipant/,
  "Image Section move lifecycle must not own renderer visual unload responsibility",
  imageSectionLifecycle,
);
const imageSectionRenderer = sourceByPath.get("src/ui/image-section-renderer.ts")?.content ?? "";
require(
  /prepareImageSectionHostContinuity\s*\(/,
  "Image Section renderer must prepare same-container visual handoff before a host is replaced",
  imageSectionRenderer,
);
require(
  /armImageSectionHostContinuity\s*\(/,
  "Image Section renderer must arm continuity before self-induced note persistence",
  imageSectionRenderer,
);
require(
  /claimImageSectionHostContinuity\s*\(/,
  "Image Section renderer must claim visual handoff for the successor host",
  imageSectionRenderer,
);

const visitState = new Map();
const visitStack = [];
const reportedCycles = new Set();
function visitDependency(file) {
  const state = visitState.get(file) ?? 0;
  if (state === 2) return;
  if (state === 1) {
    const start = visitStack.indexOf(file);
    const cycle = [...visitStack.slice(start), file];
    const members = cycle.slice(0, -1);
    const canonical = [...members].sort().join("|");
    if (!reportedCycles.has(canonical)) {
      reportedCycles.add(canonical);
      failures.push(`source dependency cycle: ${cycle.join(" -> ")}`);
    }
    return;
  }
  visitState.set(file, 1);
  visitStack.push(file);
  for (const dependency of dependencyGraph.get(file) ?? []) visitDependency(dependency);
  visitStack.pop();
  visitState.set(file, 2);
}
for (const file of dependencyGraph.keys()) visitDependency(file);

if (failures.length) {
  console.error("Architecture boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Architecture boundary check passed.");

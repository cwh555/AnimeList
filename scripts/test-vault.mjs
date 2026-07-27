import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { prepareTestFixtures, TEST_CHECKLIST_PATH } from "./test-vault-fixtures.mjs";

const RELEASE_FILES = ["main.js", "manifest.json", "styles.css"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "production";
const noOpen = process.argv.includes("--no-open") || process.env.ANIMELIST_TEST_VAULT_NO_OPEN === "1";
const vaultRoot = path.resolve(process.env.ANIMELIST_TEST_VAULT || path.join(repoRoot, "test-vault"));
const obsidianRoot = path.join(vaultRoot, ".obsidian");
const pluginsRoot = path.join(obsidianRoot, "plugins");
const pluginRoot = path.join(pluginsRoot, "animelist");

if (!new Set(["production", "development"]).has(mode)) {
  console.error("Usage: node scripts/test-vault.mjs <production|development> [--no-open]");
  process.exit(1);
}

if (vaultRoot === repoRoot) {
  console.error("ANIMELIST_TEST_VAULT must not point to the repository root.");
  process.exit(1);
}

function removePluginInstallation() {
  if (fs.lstatSync(pluginRoot, { throwIfNoEntry: false })) {
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(pluginRoot, { recursive: true });
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${path.relative(repoRoot, filePath)}. Run the matching build command first.`);
  }
}

function copyReleaseFiles() {
  for (const filename of RELEASE_FILES) {
    const source = path.join(repoRoot, filename);
    requireFile(source);
    fs.copyFileSync(source, path.join(pluginRoot, filename));
  }
}

function linkOrCopy(source, target) {
  requireFile(source);
  try {
    fs.symlinkSync(source, target, "file");
  } catch (error) {
    if (process.platform !== "win32") throw error;
    fs.copyFileSync(source, target);
    console.warn(`Could not create a file symlink on Windows; copied ${path.basename(source)} instead.`);
  }
}

function prepareDevelopmentFiles() {
  linkOrCopy(path.join(repoRoot, "manifest.json"), path.join(pluginRoot, "manifest.json"));
}

function enablePlugin() {
  const communityPluginsPath = path.join(obsidianRoot, "community-plugins.json");
  let enabledPlugins = [];
  if (fs.existsSync(communityPluginsPath)) {
    const parsed = JSON.parse(fs.readFileSync(communityPluginsPath, "utf8"));
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      throw new Error(`${communityPluginsPath} must contain a JSON array of plugin IDs.`);
    }
    enabledPlugins = parsed;
  }
  if (!enabledPlugins.includes("animelist")) enabledPlugins.push("animelist");
  fs.writeFileSync(communityPluginsPath, `${JSON.stringify(enabledPlugins, null, 2)}\n`);
}

function createDefaultAppConfig() {
  const appConfigPath = path.join(obsidianRoot, "app.json");
  if (!fs.existsSync(appConfigPath)) {
    fs.writeFileSync(appConfigPath, `${JSON.stringify({ showLineNumber: true, alwaysUpdateLinks: true }, null, 2)}\n`);
  }
}

function openVault() {
  if (noOpen) return;
  const vaultUrl = `obsidian://open?path=${encodeURIComponent(vaultRoot)}&file=${encodeURIComponent(TEST_CHECKLIST_PATH)}`;
  const command = process.platform === "darwin"
    ? ["open", [vaultUrl]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", vaultUrl]]
      : ["xdg-open", [vaultUrl]];
  const result = spawnSync(command[0], command[1], { stdio: "ignore" });
  if (result.status !== 0) {
    console.warn(`Could not open Obsidian automatically. Open this vault manually: ${vaultRoot}`);
  }
}

function printSummary(fixtures) {
  console.log(`AnimeList ${mode} test vault is ready.`);
  console.log(`Vault: ${vaultRoot}`);
  console.log(`Plugin: ${pluginRoot}`);
  console.log(`Checklist: ${fixtures.checklistPath}`);
  console.log(`Generated fixtures: ${fixtures.files.length}`);
  console.log("Reset only the generated data with: npm run test-vault:fixtures");
}

async function runDevelopmentWatcher() {
  const esbuildConfig = path.join(repoRoot, "esbuild.config.mjs");
  const styleBuilder = path.join(repoRoot, "scripts", "build-styles.mjs");
  const javascriptOutput = path.join(pluginRoot, "main.js");
  const styleOutput = path.join(pluginRoot, "styles.css");
  requireFile(esbuildConfig);
  requireFile(styleBuilder);

  const env = { ...process.env, ANIMELIST_BUILD_OUTFILE: javascriptOutput };
  const initialCommands = [
    [esbuildConfig, "production"],
    [styleBuilder, "--output", styleOutput],
  ];
  for (const arguments_ of initialCommands) {
    const result = spawnSync(process.execPath, arguments_, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }

  openVault();
  const watchers = [
    spawn(process.execPath, [esbuildConfig], { cwd: repoRoot, env, stdio: "inherit" }),
    spawn(process.execPath, [styleBuilder, "--output", styleOutput, "--watch"], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    }),
  ];
  const forwardSignal = (signal) => watchers.forEach((watcher) => watcher.kill(signal));
  process.once("SIGINT", forwardSignal);
  process.once("SIGTERM", forwardSignal);

  const result = await Promise.race(watchers.map(async (watcher, index) => {
    const [code, signal] = await once(watcher, "exit");
    return { index, code, signal };
  }));
  watchers.forEach((watcher, index) => {
    if (index !== result.index && !watcher.killed) watcher.kill("SIGTERM");
  });
  if (result.signal) process.kill(process.pid, result.signal);
  process.exit(result.code || 0);
}

fs.mkdirSync(pluginsRoot, { recursive: true });
removePluginInstallation();
enablePlugin();
createDefaultAppConfig();
const fixtures = prepareTestFixtures(vaultRoot);

if (mode === "production") {
  copyReleaseFiles();
  printSummary(fixtures);
  openVault();
} else {
  prepareDevelopmentFiles();
  printSummary(fixtures);
  await runDevelopmentWatcher();
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "serial-entry-keyboard-browser");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

try {
  const outfile = path.join(output, "spec.js");
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/browser/serial-entry-keyboard-spec.ts"],
    outfile,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    logLevel: "warning",
  });
  const bundle = await readFile(outfile, "utf8");
  const html = `<!doctype html><html><body data-result="pending">
    <div class="modal-content"><section id="editor" class="al-volume-editor"></section>
    <input id="favorite-distraction" value="favorite">
    <div class="al-modal-actions"><button id="save" class="mod-cta" type="button">Save</button></div></div>
    <script>${bundle}</script></body></html>`;
  await runChromiumDatasetTest({ html, profile, testName: "Serial-entry keyboard flow" });
} finally {
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  stop();
}

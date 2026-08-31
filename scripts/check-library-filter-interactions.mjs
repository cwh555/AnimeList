import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-filter-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { LibraryFilterModal } from "./src/ui/library-filter-modal";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "library-filter.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListLibraryFilter",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `
          export class Modal {
            constructor(app) {
              this.app = app;
              this.modalEl = document.createElement("div");
              this.modalEl.className = "modal";
              this.contentEl = document.createElement("div");
              this.contentEl.className = "modal-content";
              this.modalEl.appendChild(this.contentEl);
            }
            open() { document.body.appendChild(this.modalEl); this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export function setIcon() {}
        `,
        loader: "js",
      }));
    },
  }],
});
const bundle = await readFile(path.join(output, "library-filter.js"), "utf8");
const styles = await readFile(path.join(root, "styles.css"), "utf8");

const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${styles}</style>
</head>
<body data-result="pending">
  <script>
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.createEl = (tag) => document.createElement(tag);
  </script>
  <script>${bundle}</script>
  <script>
    const details = {};
    const initial = {
      companies: ["CloverWorks"],
      quarter: "2026:spring",
      tags: ["戀愛", "校園"],
    };
    const options = {
      companies: ["CloverWorks", "A-1 Pictures"],
      quarters: [{ key: "2026:spring", season: "spring", year: 2026 }],
      tags: ["戀愛", "校園", "喜劇"],
    };
    let applied = null;
    const modal = new AnimeListLibraryFilter.LibraryFilterModal({}, initial, options, (filters) => {
      applied = filters;
    });
    modal.open();

    setTimeout(() => {
      const clear = document.querySelector(".al-filter-clear");
      const rect = clear.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      details.clearButtonIsTappable = hit === clear || clear.contains(hit);
      details.startsWithActiveFilters = document.querySelectorAll(".al-filter-chip.is-selected").length === 4;

      clear.click();
      details.clearAppliesImmediately = !!applied
        && applied.companies.length === 0
        && applied.tags.length === 0
        && applied.quarter === "";
      details.clearClosesModal = !modal.modalEl.isConnected;

      let cancelledApplyCount = 0;
      const cancelModal = new AnimeListLibraryFilter.LibraryFilterModal({}, initial, options, () => {
        cancelledApplyCount += 1;
      });
      cancelModal.open();
      document.querySelector(".al-filter-actions button:not(.al-filter-clear)")?.click();
      details.cancelStillDoesNotApply = cancelledApplyCount === 0 && !cancelModal.modalEl.isConnected;

      document.body.dataset.details = JSON.stringify(details);
      document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
    }, 30);
  </script>
</body>
</html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Library filter interaction test",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

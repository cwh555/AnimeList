import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "score-dashboard-mobile-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { renderScoreDashboardWithBatchDrag } from "./src/ui/score-dashboard/batch-drag";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "score-dashboard-mobile-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListScoreDashboard",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export function setIcon() {}`,
        loader: "js",
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "score-dashboard-mobile-interactions.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { --background-primary:#111; --background-secondary:#222; --background-primary-alt:#181818; --background-modifier-border:#444; --background-modifier-form-field:#222; --background-modifier-hover:#333; --interactive-accent:#7777dd; --text-normal:#eee; --text-muted:#aaa; --text-faint:#777; --text-on-accent:#fff; --input-shadow:none; }
    html, body { margin:0; width:100%; min-height:100%; background:#111; color:#eee; font-family:sans-serif; }
    #dashboard { height: 780px; overflow-y:auto; }
    ${styles}
  </style>
</head>
<body data-result="pending">
  <div id="dashboard" class="animelist-score-dashboard-view"></div>
  <script>
    window.createEl = (tag) => document.createElement(tag);
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.__coverObservers = [];
    window.IntersectionObserver = class {
      constructor(callback, options) {
        this.callback = callback; this.options = options; this.targets = new Set();
        window.__coverObservers.push(this);
      }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
      disconnect() { this.targets.clear(); }
      trigger(target) { this.callback([{ isIntersecting:true, target }], this); }
    };
  </script>
  <script>${bundle}</script>
  <script>
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const cover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='36'%3E%3Crect width='24' height='36' fill='%23888'/%3E%3C/svg%3E";
    const cover2 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='36'%3E%3Crect width='24' height='36' fill='%23555'/%3E%3C/svg%3E";
    const item = (title, score, mediaType="anime") => ({
      title, originalTitle:"", mediaType, format:"", status:"completed", releaseStatus:"finished",
      progress:0, total:0, unit:"", score, favorite:false, year:"", genres:[], people:[], platforms:[],
      sourceUrls:[], cover, filePath:title + ".md", updated:0, updatedLabel:"", startedAt:"", completedAt:"", volumeLog:[],
    });
    const items = [
      item("Alpha", 9.5), item("Beta", 9.0), item("Delta", 8.5, "manga"), item("Gamma", null),
      ...Array.from({length:14}, (_, index) => item("Filler" + String(index + 1).padStart(2, "0"), 7.5)),
    ];
    const applied = [];
    const opened = [];
    const dashboard = document.querySelector("#dashboard");

    AnimeListScoreDashboard.renderScoreDashboardWithBatchDrag(dashboard, items, {
      type:"all", scale:20, showUnrated:false,
    }, {
      openFile: (filePath) => { opened.push(filePath); },
      applyChanges: async (changes) => { applied.push(changes.map((change) => ({ ...change }))); },
      confirmClamp: async () => true,
      showNotice: () => {},
      onStateChange: () => {},
    });

    const touch = (target, type, x, y, pointerId = 7) => target.dispatchEvent(new PointerEvent(type, {
      bubbles:true, cancelable:true, composed:true, pointerId, pointerType:"touch", isPrimary:true,
      clientX:x, clientY:y, buttons:type === "pointerup" ? 0 : 1,
    }));
    const center = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const poster = (path) => dashboard.querySelector('.al-score-poster[data-file-path="' + path + '"]');
    const lane = (score) => dashboard.querySelector('.al-score-lane[data-score="' + score + '"]');
    const shell = () => dashboard.querySelector('.al-score-dashboard');
    const selectedCount = () => dashboard.querySelectorAll('.al-score-poster.is-selected').length;

    (async () => {
      const details = {};

      await delay(30);
      const eagerImages = [...dashboard.querySelectorAll('.al-score-poster-image')].filter((image) => image.loading === 'eager');
      const lazyImage = [...dashboard.querySelectorAll('.al-score-poster-image')].find((image) => image.loading === 'lazy');
      const coverObserver = window.__coverObservers.at(-1);
      details.coverLoadingWindowIsBounded=eagerImages.length===12 && !!lazyImage
        && coverObserver?.targets.has(lazyImage)===true;
      coverObserver?.trigger(lazyImage);
      await delay(10);
      details.nearViewportCoverPromotesBeforeScroll=lazyImage?.loading==='eager'
        && coverObserver?.targets.has(lazyImage)===false;

      const gammaInitial = poster("Delta.md");
      gammaInitial?.querySelector('img')?.dispatchEvent(new Event('error'));
      await delay(20);
      details.brokenPosterFallsBack=!!gammaInitial?.querySelector('.al-score-poster-missing') && !gammaInitial?.querySelector('img');

      const alpha = poster("Alpha.md");
      const lane90 = lane("9.0");
      lane90.scrollIntoView({ block:"center" });
      await delay(30);
      const start = center(alpha);
      const laneTarget = center(lane90);
      const target = { x: start.x, y: laneTarget.y };
      touch(alpha, "pointerdown", start.x, start.y, 11);
      touch(alpha, "pointermove", target.x, target.y, 11);
      touch(alpha, "pointerup", target.x, target.y, 11);
      alpha.click();
      await delay(80);

      details.directTouchDragApplied = applied.length === 1
        && applied[0].length === 1
        && applied[0][0].filePath === "Alpha.md"
        && applied[0][0].nextScore === 9;
      details.dragDoesNotOpenFile = opened.length === 0;
      details.dragMovedAtTarget = poster("Alpha.md")?.dataset.score === "9.0";
      details.dragPreservesPosterNode = poster("Alpha.md") === alpha;

      const alphaAfterDrag = poster("Alpha.md");
      alphaAfterDrag.scrollIntoView({ block:"center" });
      await delay(30);
      const longPressPoint = center(alphaAfterDrag);
      touch(alphaAfterDrag, "pointerdown", longPressPoint.x, longPressPoint.y, 21);
      await delay(500);
      details.longPressEntersBatch = shell().classList.contains("is-batch-mode") && alphaAfterDrag.classList.contains("is-selected");
      touch(alphaAfterDrag, "pointerup", longPressPoint.x, longPressPoint.y, 21);
      alphaAfterDrag.click();
      await delay(20);
      details.generatedClickAfterLongPressSuppressed = shell().classList.contains("is-batch-mode")
        && alphaAfterDrag.classList.contains("is-selected")
        && selectedCount() === 1;

      const beta = poster("Beta.md");
      beta.click();
      await delay(20);
      details.tapAddsSecondSelection = shell().classList.contains("is-batch-mode")
        && selectedCount() === 2
        && beta.classList.contains("is-selected");

      alphaAfterDrag.click();
      await delay(20);
      details.deselectOneKeepsBatch = shell().classList.contains("is-batch-mode")
        && selectedCount() === 1
        && beta.classList.contains("is-selected");

      beta.click();
      await delay(30);
      details.lastDeselectionExitsBatch = !shell().classList.contains("is-batch-mode") && selectedCount() === 0;

      const batchButton = dashboard.querySelector('.al-score-dashboard-action-group .al-score-tool-button:last-child');
      const batchPoint = center(batchButton);
      touch(batchButton, "pointerdown", batchPoint.x, batchPoint.y, 31);
      touch(batchButton, "pointerup", batchPoint.x, batchPoint.y, 31);
      batchButton.click();
      await delay(30);
      details.emptyTouchBatchCannotPersist = !shell().classList.contains("is-batch-mode") && selectedCount() === 0;

      const alphaBeforeFilters = poster("Alpha.md");
      const alphaCoverBeforeFilters = alphaBeforeFilters?.querySelector("img");
      let stableCoverSourceMutations = 0;
      const stableCoverObserver = new MutationObserver((records) => {
        stableCoverSourceMutations += records.filter((record) => record.type === "attributes" && (record.attributeName === "src" || record.attributeName === "srcset")).length;
      });
      if (alphaCoverBeforeFilters) stableCoverObserver.observe(alphaCoverBeforeFilters, { attributes:true, attributeFilter:["src", "srcset"] });
      const animeTab = [...dashboard.querySelectorAll(".al-score-dashboard-tab")][1];
      animeTab.click();
      await delay(30);
      details.typeFilterPreservesPosterAndCover = poster("Alpha.md") === alphaBeforeFilters
        && poster("Alpha.md")?.querySelector("img") === alphaCoverBeforeFilters;
      const unratedToggle = dashboard.querySelector(".al-score-dashboard-action-group .al-score-tool-button");
      unratedToggle.click();
      await delay(30);
      details.unratedTogglePreservesPosterAndCover = poster("Alpha.md") === alphaBeforeFilters
        && poster("Alpha.md")?.querySelector("img") === alphaCoverBeforeFilters
        && !!poster("Gamma.md");
      unratedToggle.click();
      await delay(30);
      details.unratedToggleHidesUnratedAgain = !poster("Gamma.md");
      stableCoverObserver.disconnect();
      details.stableCoverSourceIsNotReassigned = stableCoverSourceMutations === 0;

      const alphaItem = items.find((entry) => entry.filePath === "Alpha.md");
      if (alphaItem) alphaItem.cover = cover2;
      const allTab = [...dashboard.querySelectorAll(".al-score-dashboard-tab")][0];
      allTab.click();
      await delay(30);
      const alphaAfterCoverChange = poster("Alpha.md");
      const alphaCoverAfterChange = alphaAfterCoverChange?.querySelector("img");
      details.coverMetadataChangePreservesPosterButRefreshesImage = alphaAfterCoverChange === alphaBeforeFilters
        && alphaCoverAfterChange !== alphaCoverBeforeFilters
        && alphaCoverAfterChange?.getAttribute("src") === cover2
        && !alphaCoverBeforeFilters?.isConnected;

      document.body.dataset.details = JSON.stringify(details);
      document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
    })().catch((error) => {
      document.body.dataset.details = String(error?.stack || error);
      document.body.dataset.result = "fail";
    });
  </script>
</body>
</html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Score Dashboard mobile touch interaction test",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

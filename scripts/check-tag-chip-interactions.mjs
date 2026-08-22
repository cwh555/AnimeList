import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "tag-chip-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { createMediaEditorFields } from "./src/ui/media-form-controls";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "tag-chip-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListTagFields",
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
  readFile(path.join(output, "tag-chip-interactions.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const html = `<!doctype html>
<html>
<head><style>${styles}</style></head>
<body data-result="pending">
  <nav id="collect-tabs" class="al-modal-type-tabs al-collect-type-tabs">
    <button class="al-modal-type is-active">Anime</button>
    <button class="al-modal-type">Manga</button>
    <button class="al-modal-type">Novel</button>
    <button class="al-modal-type">Custom</button>
  </nav>
  <main id="form" class="al-media-form"></main>
  <script>
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.createEl = (tag) => document.createElement(tag);
    if (!HTMLElement.prototype.toggleClass) HTMLElement.prototype.toggleClass = function(name, force) { this.classList.toggle(name, force); };
    if (!HTMLElement.prototype.addClass) HTMLElement.prototype.addClass = function(...names) { this.classList.add(...names); };
    if (!HTMLElement.prototype.removeClass) HTMLElement.prototype.removeClass = function(...names) { this.classList.remove(...names); };
  </script>
  <script>${bundle}</script>
  <script>
    const form = document.querySelector("#form");
    const fields = AnimeListTagFields.createMediaEditorFields({
      parent: form,
      mediaType: "anime",
      values: {
        title: "Example",
        status: "planned",
        releaseStatus: "unknown",
        score: "",
        startedAt: "",
        completedAt: "",
        progress: 0,
        total: 12,
        unit: "episode",
        genres: ["戀愛", "日常"],
        favorite: false,
      },
      tagOptions: ["School", "Coming of Age", "收藏"],
      tagDisplayLabels: new Map([
        ["School", "学園"],
        ["Coming of Age", "成長"],
      ]),
    });

    const details = {};
    const collectButtons = [...document.querySelectorAll("#collect-tabs .al-modal-type")];
    const collectTops = collectButtons.map((button) => Math.round(button.getBoundingClientRect().top));
    details.collectTabsStayOnOneRow = new Set(collectTops).size === 1
      && getComputedStyle(document.querySelector("#collect-tabs")).gridTemplateColumns.split(" ").filter(Boolean).length === 4;

    const completion = fields.completedAt;
    const completionButtons = [...completion.querySelectorAll(".al-completion-date-mode-button")];
    const completionTops = completionButtons.map((button) => Math.round(button.getBoundingClientRect().top));
    details.completionDateUsesSingleRowSegmentedMode = completionButtons.length === 2
      && new Set(completionTops).size === 1
      && completionButtons[0].getAttribute("aria-checked") === "true"
      && completion.querySelector(".al-date-input").hidden === false;
    completionButtons[1].click();
    details.completionDateUnknownIsCompactMode = completion.value === "unknown"
      && completionButtons[1].getAttribute("aria-checked") === "true"
      && completion.querySelector(".al-date-input").hidden === true
      && completion.querySelector(".al-completion-date-support").hidden === false;
    completionButtons[0].click();
    details.completionDateKnownRestoresDateField = completion.value === ""
      && completion.querySelector(".al-date-input").hidden === false
      && completion.querySelector(".al-completion-date-support").hidden === true;

    const tagField = fields.genres.closest(".al-form-field");

    const firstLabel = fields.genres.querySelector(".al-tag-chip-label");
    firstLabel.click();
    details.bodyClickPreserves = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常"]);

    fields.genres.querySelector(".al-tag-add-button").click();
    const school = [...fields.genres.querySelectorAll(".al-tag-suggestion")]
      .find((button) => button.textContent === "学園");
    school.click();
    details.localizedSuggestionStoresCanonical = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常", "School"]);

    const input = fields.genres.querySelector(".al-tag-picker input");
    input.value = "成長";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const comingOfAge = [...fields.genres.querySelectorAll(".al-tag-suggestion")]
      .find((button) => button.textContent === "成長");
    details.localizedSearchFindsCanonical = Boolean(comingOfAge);
    comingOfAge.click();
    details.localizedSearchStoresCanonical = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常", "School", "Coming of Age"]);

    input.value = "重看";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    details.enterAppends = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常", "School", "Coming of Age", "重看"]);

    const dailyChip = [...fields.genres.querySelectorAll(".al-tag-chip-selected")]
      .find((chip) => chip.querySelector(".al-tag-chip-label")?.textContent === "日常");
    dailyChip.querySelector(".al-tag-chip-remove").click();
    details.xOnlyRemovesOne = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "School", "Coming of Age", "重看"]);

    document.body.dataset.details = JSON.stringify(details);
    document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
  </script>
</body>
</html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Tag chip interaction test",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

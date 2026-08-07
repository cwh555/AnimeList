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
const bundle = await readFile(path.join(output, "tag-chip-interactions.js"), "utf8");

const html = `<!doctype html>
<html>
<body data-result="pending">
  <main id="form"></main>
  <script>
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.createEl = (tag) => document.createElement(tag);
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
      tagOptions: ["校園", "收藏"],
    });

    const details = {};
    const tagField = fields.genres.closest(".al-form-field");

    const firstLabel = fields.genres.querySelector(".al-tag-chip-label");
    firstLabel.click();
    details.bodyClickPreserves = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常"]);

    fields.genres.querySelector(".al-tag-add-button").click();
    const school = [...fields.genres.querySelectorAll(".al-tag-suggestion")]
      .find((button) => button.textContent === "校園");
    school.click();
    details.suggestionAppends = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常", "校園"]);

    const input = fields.genres.querySelector(".al-tag-picker input");
    input.value = "重看";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    details.enterAppends = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "日常", "校園", "重看"]);

    const dailyChip = [...fields.genres.querySelectorAll(".al-tag-chip-selected")]
      .find((chip) => chip.querySelector(".al-tag-chip-label")?.textContent === "日常");
    dailyChip.querySelector(".al-tag-chip-remove").click();
    details.xOnlyRemovesOne = JSON.stringify(fields.genres.values()) === JSON.stringify(["戀愛", "校園", "重看"]);

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

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "tag-chip-control");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: `export { createTagChipField } from "./src/ui/tag-chip-control";`,
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "tag-chip-control.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "AnimeListTagChips",
    target: "es2022",
    alias: { obsidian: path.join(root, "tests", "mocks", "obsidian.ts") },
    logLevel: "warning",
  });
  const bundle = await readFile(path.join(output, "tag-chip-control.js"), "utf8");

  const html = `<!doctype html>
<html>
<body data-result="pending">
  <main id="form"></main>
  <script>
    function applyInfo(element, info) {
      if (typeof info === "string") element.className = info;
      else if (info) {
        if (info.cls) element.className = info.cls;
        if (info.text !== undefined) element.textContent = info.text;
      }
      return element;
    }
    window.createDiv = function(info) { return applyInfo(document.createElement("div"), info); };
    window.createSpan = function(info) { return applyInfo(document.createElement("span"), info); };
    window.createEl = function(tag, info) { return applyInfo(document.createElement(tag), info); };
  </script>
  <script>${bundle}</script>
  <script>
    const form = document.querySelector("#form");
    const control = AnimeListTagChips.createTagChipField(form, {
      values: ["戀愛"],
      suggestions: ["收藏", "School"],
    });

    const wrapperTag = control.parentElement.tagName;
    control.querySelector(".al-tag-chip-label").click();
    const chipClickKeepsValue = JSON.stringify(control.values()) === JSON.stringify(["戀愛"]);

    control.querySelector(".al-tag-add-button").click();
    const input = control.querySelector(".al-tag-picker input");
    input.value = "收藏";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const enterAppends = JSON.stringify(control.values()) === JSON.stringify(["戀愛", "收藏"]);

    const romanceChip = [...control.querySelectorAll(".al-tag-chip-selected")]
      .find((chip) => chip.querySelector(".al-tag-chip-label")?.textContent === "戀愛");
    romanceChip.querySelector(".al-tag-chip-label").click();
    const secondChipClickKeepsValue = JSON.stringify(control.values()) === JSON.stringify(["戀愛", "收藏"]);
    romanceChip.querySelector(".al-tag-chip-remove").click();
    const onlyRemoveDeletes = JSON.stringify(control.values()) === JSON.stringify(["收藏"]);

    const school = [...control.querySelectorAll(".al-tag-suggestion")]
      .find((button) => button.textContent === "School");
    school.click();
    const suggestionAppends = JSON.stringify(control.values()) === JSON.stringify(["收藏", "School"]);

    const details = {
      wrapperTag,
      chipClickKeepsValue,
      enterAppends,
      secondChipClickKeepsValue,
      onlyRemoveDeletes,
      suggestionAppends,
    };
    document.body.dataset.details = JSON.stringify(details);
    document.body.dataset.result = wrapperTag === "DIV"
      && chipClickKeepsValue
      && enterAppends
      && secondChipClickKeepsValue
      && onlyRemoveDeletes
      && suggestionAppends
      ? "pass"
      : "fail";
  </script>
</body>
</html>`;

  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Tag chip add/remove interaction regression",
  });
} finally {
  stop();
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "rating-input-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export {
        createMediaEditorFields,
        createMediaFormContext,
        mediaFormValues,
      } from "./src/ui/media-form-controls";
      export { ratingFeature } from "./src/features/rating/feature";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "rating-input-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListRatingFlow",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `
          export class Notice { constructor() {} }
          export function setIcon() {}
        `,
        loader: "js",
      }));
    },
  }],
});

const bundle = await readFile(path.join(output, "rating-input-interactions.js"), "utf8");
const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body { margin:0; width:100%; height:100%; }
    body { display:flex; gap:20px; padding:20px; box-sizing:border-box; }
    .test-scroller { width:280px; height:220px; overflow-y:auto; border:1px solid #999; }
    .al-media-form { min-height:1100px; padding:12px; box-sizing:border-box; }
    .al-form-field { display:block; margin:0 0 12px; }
    .al-form-label { display:block; }
    input, select, button { min-height:30px; }
    input, select { display:block; width:180px; box-sizing:border-box; }
    .al-date-input { display:flex; }
    .al-date-input input { width:58px; }
  </style>
</head>
<body data-result="pending">
  <section id="create-scroller" class="test-scroller"><form id="create-form" class="al-media-form"></form></section>
  <section id="edit-scroller" class="test-scroller"><form id="edit-form" class="al-media-form"></form></section>
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
    const ratingContribution = AnimeListRatingFlow.ratingFeature.contributions
      .find((contribution) => contribution.kind === "media-form");

    const makeFlow = (key, mode, initialScore) => {
      const scroller = document.querySelector(\`#\${key}-scroller\`);
      const form = document.querySelector(\`#\${key}-form\`);
      const fields = AnimeListRatingFlow.createMediaEditorFields({
        parent: form,
        mediaType: "anime",
        values: {
          title: mode === "create" ? "Create example" : "Edit example",
          status: "planned",
          releaseStatus: "unknown",
          score: initialScore,
          startedAt: "",
          completedAt: "",
          progress: 0,
          total: 12,
          unit: "episode",
          genres: [],
          favorite: false,
        },
      });
      const context = AnimeListRatingFlow.createMediaFormContext({
        mode,
        plugin: {},
        modalEl: scroller,
        formEl: form,
        mediaType: "anime",
        result: null,
        file: null,
        frontmatter: {},
        fields,
      });
      ratingContribution.configure?.(context);
      return { scroller, form, fields, context };
    };

    window.ratingFlows = {
      create: makeFlow("create", "create", ""),
      edit: makeFlow("edit", "edit", "4.5"),
      contribution: ratingContribution,
    };
  </script>
</body>
</html>`;

const evaluate = async (send, expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Chromium evaluation failed");
  return result.result.value;
};

const fieldCenter = async (send, key) => JSON.parse(await evaluate(send, `(() => {
  const flow = window.ratingFlows[${JSON.stringify(key)}];
  flow.scroller.scrollTop = 0;
  flow.fields.score.focus();
  const rect = flow.fields.score.getBoundingClientRect();
  return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
})()`));

const dispatchWheel = async (send, point, deltaY = 160) => {
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", x:point.x, y:point.y });
  await send("Input.dispatchMouseEvent", {
    type:"mouseWheel", x:point.x, y:point.y, deltaX:0, deltaY,
  });
};

const dispatchArrow = async (send, key) => {
  const code = key === "ArrowUp" ? "ArrowUp" : "ArrowDown";
  const windowsVirtualKeyCode = key === "ArrowUp" ? 38 : 40;
  await send("Input.dispatchKeyEvent", { type:"rawKeyDown", key, code, windowsVirtualKeyCode });
  await send("Input.dispatchKeyEvent", { type:"keyUp", key, code, windowsVirtualKeyCode });
};

const stressWheel = async (send, sleep, key) => {
  for (let half = 0; half <= 20; half += 1) {
    const expected = String(half / 2);
    await evaluate(send, `(() => {
      const flow = window.ratingFlows[${JSON.stringify(key)}];
      flow.fields.score.value = ${JSON.stringify(expected)};
      flow.fields.score.dispatchEvent(new Event("input", { bubbles:true }));
      flow.scroller.scrollTop = 0;
      flow.fields.score.focus();
    })()`);
    const point = await fieldCenter(send, key);
    await dispatchWheel(send, point, half % 2 === 0 ? 160 : -160);
    await sleep(10);
    const actual = await evaluate(send, `window.ratingFlows[${JSON.stringify(key)}].fields.score.value`);
    if (actual !== expected) return false;
  }
  return true;
};

const checkKeyboardStep = async (send, sleep, key) => {
  await evaluate(send, `(() => {
    const score = window.ratingFlows[${JSON.stringify(key)}].fields.score;
    score.value = "9";
    score.focus();
  })()`);
  await dispatchArrow(send, "ArrowUp");
  await sleep(20);
  const up = await evaluate(send, `window.ratingFlows[${JSON.stringify(key)}].fields.score.value`);
  await dispatchArrow(send, "ArrowDown");
  await sleep(20);
  const down = await evaluate(send, `window.ratingFlows[${JSON.stringify(key)}].fields.score.value`);
  return up === "9.5" && down === "9";
};

const checkSubmitSnapshot = async (send, key, capturedValue, laterDomValue) => evaluate(send, `(() => {
  const flow = window.ratingFlows[${JSON.stringify(key)}];
  flow.fields.score.value = ${JSON.stringify(capturedValue)};
  const form = AnimeListRatingFlow.mediaFormValues(flow.context);
  flow.fields.score.value = ${JSON.stringify(laterDomValue)};
  window.ratingFlows.contribution.prepareSubmit?.({ ...flow.context, form });
  return JSON.stringify({ persisted: form.score, liveDom: flow.fields.score.value });
})()`);

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Rating production create/edit interaction regression",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 720, height: 480, deviceScaleFactor: 1, mobile: false },
    interact: async ({ send, sleep }) => {
      await sleep(60);

      const productionControls = JSON.parse(await evaluate(send, `JSON.stringify({
        createType: window.ratingFlows.create.fields.score.type,
        editType: window.ratingFlows.edit.fields.score.type,
        createInputMode: window.ratingFlows.create.fields.score.inputMode,
        editInputMode: window.ratingFlows.edit.fields.score.inputMode,
      })`));

      const createKeyboardStep = await checkKeyboardStep(send, sleep, "create");
      const editKeyboardStep = await checkKeyboardStep(send, sleep, "edit");
      const createEveryHalfPointStable = await stressWheel(send, sleep, "create");
      const editEveryHalfPointStable = await stressWheel(send, sleep, "edit");

      await evaluate(send, `(() => {
        const flow = window.ratingFlows.create;
        flow.fields.score.value = "9";
        flow.scroller.scrollTop = 0;
        flow.fields.score.focus();
      })()`);
      const createPoint = await fieldCenter(send, "create");
      await dispatchWheel(send, createPoint, 160);
      await sleep(60);
      const createWheelValue = await evaluate(send, `window.ratingFlows.create.fields.score.value`);
      const createScrollTop = await evaluate(send, `window.ratingFlows.create.scroller.scrollTop`);

      await evaluate(send, `(() => {
        const flow = window.ratingFlows.edit;
        flow.fields.score.value = "7";
        flow.scroller.scrollTop = 0;
        flow.fields.score.focus();
      })()`);
      const editPoint = await fieldCenter(send, "edit");
      await dispatchWheel(send, editPoint, 160);
      await sleep(60);
      const editWheelValue = await evaluate(send, `window.ratingFlows.edit.fields.score.value`);
      const editScrollTop = await evaluate(send, `window.ratingFlows.edit.scroller.scrollTop`);

      const createSnapshot = JSON.parse(await checkSubmitSnapshot(send, "create", "9", "6"));
      const editSnapshot = JSON.parse(await checkSubmitSnapshot(send, "edit", "7.5", "2.5"));
      const roundedSnapshot = JSON.parse(await checkSubmitSnapshot(send, "edit", "7.2", "1"));

      await evaluate(send, `(() => {
        const details = {
          createUsesControlledTextInput: ${JSON.stringify(productionControls.createType)} === "text",
          editUsesControlledTextInput: ${JSON.stringify(productionControls.editType)} === "text",
          createRequestsDecimalKeyboard: ${JSON.stringify(productionControls.createInputMode)} === "decimal",
          editRequestsDecimalKeyboard: ${JSON.stringify(productionControls.editInputMode)} === "decimal",
          createKeyboardStepPreserved: ${JSON.stringify(createKeyboardStep)},
          editKeyboardStepPreserved: ${JSON.stringify(editKeyboardStep)},
          createEveryHalfPointStableUnderWheel: ${JSON.stringify(createEveryHalfPointStable)},
          editEveryHalfPointStableUnderWheel: ${JSON.stringify(editEveryHalfPointStable)},
          createWheelKeepsTypedScore: ${JSON.stringify(createWheelValue)} === "9",
          editWheelKeepsTypedScore: ${JSON.stringify(editWheelValue)} === "7",
          createWheelStillScrollsForm: ${JSON.stringify(createScrollTop)} > 0,
          editWheelStillScrollsForm: ${JSON.stringify(editScrollTop)} > 0,
          createSubmitUsesCapturedSnapshot: ${JSON.stringify(createSnapshot.persisted)} === 9 && ${JSON.stringify(createSnapshot.liveDom)} === "6",
          editSubmitUsesCapturedSnapshot: ${JSON.stringify(editSnapshot.persisted)} === 7.5 && ${JSON.stringify(editSnapshot.liveDom)} === "2.5",
          roundingUsesCapturedSnapshot: ${JSON.stringify(roundedSnapshot.persisted)} === 7 && ${JSON.stringify(roundedSnapshot.liveDom)} === "7.0",
        };
        document.body.dataset.details = JSON.stringify(details);
        document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
      })()`);
    },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

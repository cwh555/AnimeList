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
      export { installRatingInputBehavior } from "./src/ui/rating-input";
      export { normalizeRating } from "./src/domain/rating";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "rating-input-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListRatingInput",
  target: "es2022",
  logLevel: "warning",
});

const bundle = await readFile(path.join(output, "rating-input-interactions.js"), "utf8");
const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body { margin:0; width:100%; height:100%; }
    #scroller { width:360px; height:180px; overflow-y:auto; }
    #content { height:1200px; padding:24px; }
    input { display:block; width:140px; height:36px; margin-bottom:24px; }
  </style>
</head>
<body data-result="pending">
  <div id="scroller">
    <div id="content">
      <input id="legacy" type="number" min="0" max="10" step="0.5" value="9">
      <input id="score" type="text" value="9">
    </div>
  </div>
  <script>${bundle}</script>
  <script>
    // Reproduce the ancestor-listener environment that exposed Chromium's
    // native number-input wheel behavior in real scrolling applications.
    document.body.addEventListener("wheel", () => {}, { passive:true });
    const score = document.querySelector("#score");
    window.disposeRatingInput = AnimeListRatingInput.installRatingInputBehavior(score);
  </script>
</body>
</html>`;

const evaluate = async (send, expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result.value;
};

const fieldCenter = async (send, selector) => JSON.parse(await evaluate(send, `(() => {
  const scroller = document.querySelector("#scroller");
  scroller.scrollTop = 0;
  const field = document.querySelector(${JSON.stringify(selector)});
  field.focus();
  const rect = field.getBoundingClientRect();
  return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
})()`));

const dispatchWheel = async (send, point, deltaY = 160) => {
  await send("Input.dispatchMouseEvent", { type:"mouseMoved", x:point.x, y:point.y });
  await send("Input.dispatchMouseEvent", {
    type:"mouseWheel", x:point.x, y:point.y, deltaX:0, deltaY,
  });
};

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Rating controlled-input interaction regression",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 640, height: 480, deviceScaleFactor: 1, mobile: false },
    interact: async ({ send, sleep }) => {
      await sleep(40);

      // Diagnostic reproduction of the released native number-input design.
      await evaluate(send, `document.querySelector("#legacy").value = "9"`);
      const legacyPoint = await fieldCenter(send, "#legacy");
      await dispatchWheel(send, legacyPoint);
      await sleep(60);
      const legacyValueAfterWheel = await evaluate(send, `document.querySelector("#legacy").value`);

      const scorePoint = await fieldCenter(send, "#score");
      await evaluate(send, `document.querySelector("#score").value = "9"`);
      await send("Input.dispatchKeyEvent", { type:"rawKeyDown", key:"ArrowUp", code:"ArrowUp", windowsVirtualKeyCode:38 });
      await send("Input.dispatchKeyEvent", { type:"keyUp", key:"ArrowUp", code:"ArrowUp", windowsVirtualKeyCode:38 });
      await sleep(20);
      const keyboardUpValue = await evaluate(send, `document.querySelector("#score").value`);
      await send("Input.dispatchKeyEvent", { type:"rawKeyDown", key:"ArrowDown", code:"ArrowDown", windowsVirtualKeyCode:40 });
      await send("Input.dispatchKeyEvent", { type:"keyUp", key:"ArrowDown", code:"ArrowDown", windowsVirtualKeyCode:40 });
      await sleep(20);
      const keyboardRoundTripValue = await evaluate(send, `document.querySelector("#score").value`);

      let allScoresStable = true;
      for (let half = 0; half <= 20; half += 1) {
        const expected = String(half / 2);
        await evaluate(send, `(() => {
          const score = document.querySelector("#score");
          const scroller = document.querySelector("#scroller");
          score.value = ${JSON.stringify(expected)};
          score.dispatchEvent(new Event("input", { bubbles:true }));
          scroller.scrollTop = 0;
          score.focus();
        })()`);
        const point = await fieldCenter(send, "#score");
        await dispatchWheel(send, point, half % 2 === 0 ? 160 : -160);
        await sleep(12);
        const actual = await evaluate(send, `document.querySelector("#score").value`);
        if (actual !== expected) {
          allScoresStable = false;
          break;
        }
      }

      await evaluate(send, `(() => {
        const score = document.querySelector("#score");
        const scroller = document.querySelector("#scroller");
        score.value = "9";
        scroller.scrollTop = 0;
        score.focus();
      })()`);
      const wheelPoint = await fieldCenter(send, "#score");
      await dispatchWheel(send, wheelPoint, 160);
      await sleep(60);
      const wheelValue = await evaluate(send, `document.querySelector("#score").value`);
      const scrollTop = await evaluate(send, `document.querySelector("#scroller").scrollTop`);

      const capturedScore = await evaluate(send, `document.querySelector("#score").value`);
      await evaluate(send, `document.querySelector("#score").value = "6"`);
      const normalizedCaptured = await evaluate(send, `AnimeListRatingInput.normalizeRating(${JSON.stringify(capturedScore)}).value`);

      await evaluate(send, `(() => {
        const score = document.querySelector("#score");
        const details = {
          legacyNativeWheelMutationObserved: ${JSON.stringify(legacyValueAfterWheel)} !== "9",
          controlledInputIsText: score.type === "text",
          decimalKeyboardRequested: score.inputMode === "decimal",
          keyboardStepPreserved: ${JSON.stringify(keyboardUpValue)} === "9.5" && ${JSON.stringify(keyboardRoundTripValue)} === "9",
          everyHalfPointStableUnderWheel: ${JSON.stringify(allScoresStable)},
          wheelKeepsTypedScore: ${JSON.stringify(wheelValue)} === "9",
          wheelStillScrollsForm: ${JSON.stringify(scrollTop)} > 0,
          capturedScoreIndependentOfLaterDom: ${JSON.stringify(normalizedCaptured)} === 9,
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

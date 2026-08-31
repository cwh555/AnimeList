import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "rating-number-input-wheel");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { installNumberInputWheelGuard } from "./src/ui/number-input-wheel-guard";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "rating-number-input-wheel.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListNumberInputWheel",
  target: "es2022",
  logLevel: "warning",
});

const bundle = await readFile(path.join(output, "rating-number-input-wheel.js"), "utf8");
const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html, body { margin:0; width:100%; height:100%; }
    #scroller { width:320px; height:180px; overflow-y:auto; }
    #content { height:900px; padding:24px; }
    #score { width:120px; height:36px; }
  </style>
</head>
<body data-result="pending">
  <div id="scroller">
    <div id="content">
      <input id="score" type="number" min="0" max="10" step="0.5" value="9">
    </div>
  </div>
  <script>${bundle}</script>
  <script>
    document.body.addEventListener("wheel", () => {}, { passive:true });
    const score = document.querySelector("#score");
    window.disposeScoreWheelGuard = AnimeListNumberInputWheel.installNumberInputWheelGuard(score);
  </script>
</body>
</html>`;

const evaluate = async (send, expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result.value;
};

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Rating number input trusted-wheel regression",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 640, height: 480, deviceScaleFactor: 1, mobile: false },
    interact: async ({ send, sleep }) => {
      await sleep(40);
      const rectJson = await evaluate(send, `(() => {
        const score = document.querySelector("#score");
        score.focus();
        const rect = score.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      })()`);
      const point = JSON.parse(rectJson);

      await send("Input.dispatchKeyEvent", { type:"rawKeyDown", key:"ArrowUp", code:"ArrowUp", windowsVirtualKeyCode:38 });
      await send("Input.dispatchKeyEvent", { type:"keyUp", key:"ArrowUp", code:"ArrowUp", windowsVirtualKeyCode:38 });
      await sleep(20);
      const keyboardValue = await evaluate(send, `document.querySelector("#score").value`);

      await evaluate(send, `(() => {
        const score = document.querySelector("#score");
        const scroller = document.querySelector("#scroller");
        score.value = "9";
        scroller.scrollTop = 0;
        score.focus();
      })()`);
      await send("Input.dispatchMouseEvent", { type:"mouseMoved", x:point.x, y:point.y });
      await send("Input.dispatchMouseEvent", {
        type:"mouseWheel", x:point.x, y:point.y, deltaX:0, deltaY:160,
      });
      await sleep(80);

      await evaluate(send, `(() => {
        const score = document.querySelector("#score");
        const scroller = document.querySelector("#scroller");
        const details = {
          keyboardStepPreserved: ${JSON.stringify(keyboardValue)} === "9.5",
          wheelKeepsTypedScore: score.value === "9",
          wheelReleasesNumberFocus: document.activeElement !== score,
          wheelStillScrollsForm: scroller.scrollTop > 0,
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

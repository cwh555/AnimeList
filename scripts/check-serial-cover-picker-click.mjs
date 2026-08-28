import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";

const root = process.cwd();
const output = path.join(root, ".tmp", "serial-cover-picker-click");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { renderSerialCoverCandidateRow } from "./src/ui/serial-covers/picker";
      export { SerialCoverDirectApply, directlyApplySerialCover } from "./src/app/serial-covers/direct-apply";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "serial-cover-picker.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "SerialCoverPicker",
  target: "es2022",
  logLevel: "warning",
});
const pickerBundle = await readFile(path.join(output, "serial-cover-picker.js"), "utf8");

const html = `<!doctype html>
<html>
<body data-result="pending">
  <section class="al-serial-cover-modal">
    <div class="al-search-results"></div>
  </section>
  <script>
    function applyInfo(element, info) {
      if (typeof info === "string") element.className = info;
      else if (info) {
        if (info.cls) element.className = info.cls;
        if (info.text !== undefined) element.textContent = info.text;
      }
      return element;
    }
    window.createDiv = () => document.createElement("div");
        HTMLElement.prototype.createDiv = function(info) {
      const element = applyInfo(document.createElement("div"), info);
      this.append(element);
      return element;
    };
    HTMLElement.prototype.createSpan = function(info) {
      const element = applyInfo(document.createElement("span"), info);
      this.append(element);
      return element;
    };
    HTMLElement.prototype.createEl = function(tag, info) {
      const element = applyInfo(document.createElement(tag), info);
      this.append(element);
      return element;
    };
  </script>
  <script>${pickerBundle}</script>
  <script>
    const candidates = [
      { provider: "Bangumi", sourceId: "first", title: "Volume 1", coverUrl: "data:image/png;base64,AAAA", infoUrl: "", score: 100 },
      { provider: "Bangumi", sourceId: "second", title: "Volume 2", coverUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", infoUrl: "", score: 99 },
    ];
    const modal = document.querySelector(".al-serial-cover-modal");
    const results = document.querySelector(".al-search-results");
    const action = new SerialCoverPicker.SerialCoverDirectApply();
    let applied = "";
    let loaded = "";
    let closed = false;
    let initialBrokenFallback = false;

    const finish = () => {
      const rows = [...results.querySelectorAll("button.al-search-result")];
      const brokenFallback = initialBrokenFallback;
      const passed = rows.length === 2
        && rows.every((row) => row instanceof HTMLButtonElement && row.type === "button")
        && brokenFallback
        && !document.querySelector(".al-search-result-use")
        && ![...document.querySelectorAll("button")].some((button) => button.textContent === "Apply" || button.textContent === "選用")
        && loaded === "second"
        && applied === "cover:second"
        && closed
        && modal.hidden;
      document.body.dataset.result = passed ? "pass" : "fail";
      document.body.dataset.loaded = loaded;
      document.body.dataset.applied = applied;
      document.body.dataset.closed = String(closed);
      document.body.dataset.rowCount = String(rows.length);
      document.body.dataset.brokenFallback = String(brokenFallback);
    };

    const render = () => {
      results.replaceChildren();
      for (const candidate of candidates) {
        const applying = action.activeSourceId === candidate.sourceId;
        SerialCoverPicker.renderSerialCoverCandidateRow(results, candidate, {
          disabled: action.isApplying,
          applying,
          matchLabel: applying ? "Applying…" : "Match score " + candidate.score,
          onChoose: () => {
            const operation = SerialCoverPicker.directlyApplySerialCover(
              action,
              candidate,
              async (selected) => {
                loaded = selected.sourceId;
                await Promise.resolve();
                return "cover:" + selected.sourceId;
              },
              (cover) => { applied = cover; },
              () => { closed = true; modal.hidden = true; },
            );
            render();
            operation.then(finish);
          },
        });
      }
    };

    render();
    const initialRows = results.querySelectorAll("button.al-search-result");
    initialRows[0].querySelector("img")?.dispatchEvent(new Event("error"));
    initialBrokenFallback = initialRows[0].querySelector(".al-search-result-placeholder") !== null
      && initialRows[0].querySelector("img") === null;
    const secondRow = initialRows[1];
    secondRow.click();
  </script>
</body>
</html>`;

async function executable(pathname) {
  try {
    await access(pathname);
    return pathname;
  } catch {
    return "";
  }
}

const commandNames = process.platform === "win32"
  ? ["chrome.exe", "msedge.exe"]
  : ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge"];
let browser = "";
for (const name of commandNames) {
  const found = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  if (found.status === 0) {
    browser = found.stdout.trim().split(/\r?\n/)[0];
    break;
  }
}
if (!browser && process.platform === "darwin") {
  for (const pathname of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) {
    browser = await executable(pathname);
    if (browser) break;
  }
}

if (!browser) {
  await rm(output, { recursive: true, force: true });
  stop();
  if (process.env.ANIMELIST_REQUIRE_CHROMIUM === "1") {
    assert.fail("A Chromium-compatible browser is required for the serial-cover picker click test.");
  }
  console.log("Serial cover Chromium click test skipped: no compatible browser found.");
  process.exit(0);
}

const debugPort = await new Promise((resolve, reject) => {
  const reservation = net.createServer();
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", () => {
    const address = reservation.address();
    assert.ok(address && typeof address === "object");
    reservation.close(() => resolve(address.port));
  });
});

const chrome = spawn(browser, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeError = "";
chrome.stderr.setEncoding("utf8");
chrome.stderr.on("data", (chunk) => { chromeError += chunk; });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let socket;
try {
  let target;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      target = targets.find((candidate) => candidate.type === "page");
      if (target) break;
    } catch {
      // Chromium has not opened its debugger socket yet.
    }
    await sleep(100);
  }
  assert.ok(target, `Chromium did not expose a page target. ${chromeError}`);

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  const frameTree = await send("Page.getFrameTree");
  await send("Page.setDocumentContent", {
    frameId: frameTree.frameTree.frame.id,
    html,
  });

  let dataset = {};
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const evaluated = await send("Runtime.evaluate", {
      expression: "JSON.stringify({ ...document.body.dataset })",
      returnByValue: true,
    });
    dataset = JSON.parse(evaluated.result.value || "{}");
    if (dataset.result && dataset.result !== "pending") break;
    await sleep(30);
  }

  assert.deepEqual(dataset, {
    result: "pass",
    loaded: "second",
    applied: "cover:second",
    closed: "true",
    rowCount: "2",
    brokenFallback: "true",
  });
  console.log("Serial cover card click directly applies and closes in Chromium.");
} finally {
  socket?.close();
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGKILL");
    await Promise.race([exited, sleep(3000)]);
  }
  stop();
  await rm(output, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 100,
  });
}

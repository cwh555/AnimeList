import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";

const root = process.cwd();
const output = path.join(root, ".tmp", "segmented-date-keyboard-flow");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { createSerialEntryDateControls } from "./src/ui/serial-entry-date-controls";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "serial-entry-date-controls.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "SerialEntryDates",
  target: "es2022",
  logLevel: "warning",
});
const bundle = await readFile(path.join(output, "serial-entry-date-controls.js"), "utf8");

const html = `<!doctype html>
<html>
<body data-result="pending">
  <div class="modal-content" id="modal">
    <input id="serial-label" value="7">
    <button id="add-entry" type="button">Add entry</button>
  </div>
  <script>
    function applyInfo(element, info) {
      if (typeof info === "string") element.className = info;
      else if (info) {
        if (info.cls) element.className = info.cls;
        if (info.text !== undefined) element.textContent = info.text;
      }
      return element;
    }
    window.createEl = (tag, info) => applyInfo(document.createElement(tag), info);
    window.createDiv = (info) => applyInfo(document.createElement("div"), info);
    window.createSpan = (info) => applyInfo(document.createElement("span"), info);
  </script>
  <script>${bundle}</script>
  <script>
    const modal = document.getElementById("modal");
    const labelInput = document.getElementById("serial-label");
    const addButton = document.getElementById("add-entry");
    const controls = SerialEntryDates.createSerialEntryDateControls({
      labelInput,
      addButton,
      startedAt: "",
      completedAt: "",
    });
    modal.insertBefore(controls.startedAt, addButton);
    modal.insertBefore(controls.completedAt, addButton);

    // Force both requested targets into a layout where offsetParent is null.
    // Explicit typed targets must still work and must not depend on modal-wide scanning.
    labelInput.style.position = "fixed";
    controls.startedAt.parts.day.style.position = "fixed";

    const pressBackspace = (input) => {
      const event = new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const emitInput = (input) => input.dispatchEvent(new Event("input", { bubbles: true }));
    const details = {};

    controls.startedAt.parts.year.focus();
    controls.startedAt.parts.year.value = "";
    details.startedPrevented = pressBackspace(controls.startedAt.parts.year);
    details.startedTarget = document.activeElement === labelInput;

    controls.completedAt.parts.year.focus();
    controls.completedAt.parts.year.value = "";
    details.completedPrevented = pressBackspace(controls.completedAt.parts.year);
    details.completedTarget = document.activeElement === controls.startedAt.parts.day;

    controls.startedAt.parts.year.focus();
    controls.startedAt.parts.year.value = "2026";
    details.nonEmptyPrevented = pressBackspace(controls.startedAt.parts.year);
    details.nonEmptyStayed = document.activeElement === controls.startedAt.parts.year;

    controls.startedAt.parts.month.focus();
    controls.startedAt.parts.month.value = "";
    details.monthPrevented = pressBackspace(controls.startedAt.parts.month);
    details.monthTarget = document.activeElement === controls.startedAt.parts.year;

    controls.completedAt.parts.year.value = "2026";
    controls.completedAt.parts.month.value = "07";
    controls.completedAt.parts.day.focus();
    controls.completedAt.parts.day.value = "31";
    emitInput(controls.completedAt.parts.day);
    details.completionTarget = document.activeElement === addButton;

    const passed = details.startedPrevented
      && details.startedTarget
      && details.completedPrevented
      && details.completedTarget
      && details.nonEmptyPrevented === false
      && details.nonEmptyStayed
      && details.monthPrevented
      && details.monthTarget
      && details.completionTarget;
    document.body.dataset.details = JSON.stringify(details);
    document.body.dataset.result = passed ? "pass" : "fail";
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
    assert.fail("A Chromium-compatible browser is required for the segmented-date keyboard test.");
  }
  console.log("Segmented-date Chromium keyboard test skipped: no compatible browser found.");
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

  assert.equal(dataset.result, "pass", dataset.details || "No browser details returned");
  console.log(`Segmented-date keyboard flow passed in Chromium: ${dataset.details}`);
} finally {
  socket?.close();
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await Promise.race([once(chrome, "exit"), sleep(3000)]);
  }
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  stop();
}

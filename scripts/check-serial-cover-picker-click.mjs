import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const output = path.join(root, ".tmp", "serial-cover-picker-click");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const tsc = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
const compiled = spawnSync(tsc, [
  "src/serial-cover-picker-events.ts",
  "--target", "ES2022",
  "--module", "ES2022",
  "--moduleResolution", "Bundler",
  "--lib", "ES2022,DOM,DOM.Iterable",
  "--types", "obsidian",
  "--skipLibCheck",
  "--rootDir", "src",
  "--outDir", output,
], { cwd: root, encoding: "utf8" });
assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

let pickerBundle = await readFile(path.join(output, "serial-cover-picker-events.js"), "utf8");
pickerBundle = `${pickerBundle.replaceAll("export function ", "function ")}\n`
  + "globalThis.SerialCoverPicker = { installSerialCoverPickerEvents, synchronizeSerialCoverApply };\n";

const html = `<!doctype html>
<html>
<body data-result="pending">
  <section class="al-serial-cover-modal">
    <div class="al-modal-search-row"><input type="search"><button type="button">Search</button></div>
    <div class="al-search-results">
      <button type="button" class="al-search-result is-selected" data-id="first">
        <span class="al-search-result-use">選用</span>
      </button>
      <button type="button" class="al-search-result" data-id="second">
        <span class="al-search-result-use">選用</span>
      </button>
    </div>
    <div class="al-modal-actions">
      <button type="button">Cancel</button>
      <button type="button" class="mod-cta" disabled>Apply</button>
    </div>
  </section>
  <script>${pickerBundle}</script>
  <script>
    const modal = document.querySelector(".al-serial-cover-modal");
    const apply = modal.querySelector(".al-modal-actions .mod-cta");
    let selected = "first";
    let applied = "";

    for (const row of modal.querySelectorAll(".al-search-result")) {
      row.addEventListener("click", () => {
        selected = row.dataset.id;
        for (const candidate of modal.querySelectorAll(".al-search-result")) {
          candidate.classList.toggle("is-selected", candidate === row);
        }
      });
    }
    apply.addEventListener("click", () => { applied = selected; });
    SerialCoverPicker.installSerialCoverPickerEvents({ register() {} });

    Promise.resolve().then(() => {
      const initialEnabled = !apply.disabled;
      const secondSelect = modal.querySelectorAll(".al-search-result-use")[1];
      const roleReady = secondSelect.getAttribute("role") === "button" && secondSelect.tabIndex === 0;
      secondSelect.click();
      return Promise.resolve().then(() => {
        apply.click();
        const secondRow = modal.querySelector('[data-id="second"]');
        const passed = initialEnabled
          && roleReady
          && selected === "second"
          && secondRow.classList.contains("is-selected")
          && !apply.disabled
          && applied === "second";
        document.body.dataset.result = passed ? "pass" : "fail";
        document.body.dataset.selected = selected;
        document.body.dataset.applied = applied;
        document.body.dataset.initialEnabled = String(initialEnabled);
      });
    });
  </script>
</body>
</html>`;

const browserNames = process.platform === "win32"
  ? ["chrome.exe", "msedge.exe"]
  : ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"];
let browser = "";
for (const name of browserNames) {
  const found = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
    encoding: "utf8",
  });
  if (found.status === 0) {
    browser = found.stdout.trim().split(/\r?\n/)[0];
    break;
  }
}
assert.ok(browser, "A Chromium-compatible browser is required for the serial-cover picker click test.");

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
    selected: "second",
    applied: "second",
    initialEnabled: "true",
  });
  console.log("Serial cover Select and Apply Chromium click test passed.");
} finally {
  socket?.close();
  chrome.kill("SIGKILL");
  await rm(output, { recursive: true, force: true });
}

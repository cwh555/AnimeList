import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function executable(pathname) {
  try {
    await access(pathname);
    return pathname;
  } catch {
    return "";
  }
}

async function findChromium() {
  const commandNames = process.platform === "win32"
    ? ["chrome.exe", "msedge.exe"]
    : ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "microsoft-edge"];
  for (const name of commandNames) {
    const found = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    if (found.status === 0) return found.stdout.trim().split(/\r?\n/)[0];
  }
  if (process.platform !== "darwin") return "";
  for (const pathname of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) {
    const found = await executable(pathname);
    if (found) return found;
  }
  return "";
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runChromiumDatasetTest({
  html,
  profile,
  testName,
  requireEnvironment = "ANIMELIST_REQUIRE_CHROMIUM",
  viewport,
}) {
  const browser = await findChromium();
  if (!browser) {
    if (process.env[requireEnvironment] === "1") {
      assert.fail(`A Chromium-compatible browser is required for ${testName}.`);
    }
    console.log(`${testName} skipped: no compatible browser found.`);
    return;
  }

  const chrome = spawn(browser, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let chromeError = "";
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => { chromeError += chunk; });

  let socket;
  try {
    let debugPort;
    const activePortFile = path.join(profile, "DevToolsActivePort");
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (chrome.exitCode !== null) break;
      try {
        const [portLine] = (await readFile(activePortFile, "utf8")).split(/\r?\n/);
        const parsedPort = Number.parseInt(portLine, 10);
        if (Number.isInteger(parsedPort) && parsedPort > 0) {
          debugPort = parsedPort;
          break;
        }
      } catch {
        // Chromium has not finished creating its debugger endpoint yet.
      }
      await sleep(100);
    }
    assert.ok(
      debugPort,
      chrome.exitCode === null
        ? `Chromium did not expose a debugger port within 30 seconds. ${chromeError}`
        : `Chromium exited before exposing a debugger port (exit ${chrome.exitCode}). ${chromeError}`,
    );

    let target;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (chrome.exitCode !== null) break;
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
        target = targets.find((candidate) => candidate.type === "page");
        if (target) break;
      } catch {
        // The debugger port exists, but the page target is not ready yet.
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
    if (viewport) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        mobile: viewport.mobile ?? false,
      });
    }
    const frameTree = await send("Page.getFrameTree");
    await send("Page.setDocumentContent", {
      frameId: frameTree.frameTree.frame.id,
      html,
    });

    let dataset = {};
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const evaluated = await send("Runtime.evaluate", {
        expression: "JSON.stringify({ ...document.body.dataset })",
        returnByValue: true,
      });
      dataset = JSON.parse(evaluated.result.value || "{}");
      if (dataset.result && dataset.result !== "pending") break;
      await sleep(30);
    }
    assert.equal(dataset.result, "pass", dataset.details || "No browser details returned");
    console.log(`${testName} passed in Chromium: ${dataset.details}`);
  } finally {
    socket?.close();
    if (chrome.exitCode === null) {
      chrome.kill("SIGTERM");
      await Promise.race([once(chrome, "exit"), sleep(3000)]);
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

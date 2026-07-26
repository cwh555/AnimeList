import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const output = path.join(root, ".tmp", "serial-cover-picker-click");
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
  "--lib", "ES2022,DOM",
  "--skipLibCheck",
  "--rootDir", "src",
  "--outDir", output,
], { cwd: root, encoding: "utf8" });
assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

await writeFile(path.join(output, "index.html"), `<!doctype html>
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
    <div class="al-modal-actions"><button type="button">Cancel</button><button type="button" class="mod-cta" disabled>Apply</button></div>
  </section>
  <script type="module">
    import { installSerialCoverPickerEvents } from "./serial-cover-picker-events.js";
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
    installSerialCoverPickerEvents({ register() {} });
    await Promise.resolve();
    const initialEnabled = !apply.disabled;
    const secondSelect = modal.querySelectorAll(".al-search-result-use")[1];
    const roleReady = secondSelect.getAttribute("role") === "button" && secondSelect.tabIndex === 0;
    secondSelect.click();
    await Promise.resolve();
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
  </script>
</body>
</html>`, "utf8");

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

const server = createServer(async (request, response) => {
  const pathname = request.url === "/" ? "/index.html" : request.url;
  const file = path.join(output, pathname.replace(/^\//, ""));
  try {
    const content = await readFile(file);
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8",
    );
    response.end(content);
  } catch {
    response.statusCode = 404;
    response.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const browserResult = spawnSync(browser, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--virtual-time-budget=2000",
  "--dump-dom",
  `http://127.0.0.1:${address.port}/`,
], { encoding: "utf8", timeout: 30000 });
server.close();
await rm(output, { recursive: true, force: true });

assert.equal(browserResult.status, 0, browserResult.stderr || browserResult.stdout);
assert.match(browserResult.stdout, /data-result="pass"/);
assert.match(browserResult.stdout, /data-selected="second"/);
assert.match(browserResult.stdout, /data-applied="second"/);
assert.match(browserResult.stdout, /data-initial-enabled="true"/);
console.log("Serial cover Select and Apply Chromium click test passed.");

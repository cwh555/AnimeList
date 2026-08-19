import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-export");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { renderLibraryExportTextFields } from "./src/ui/library-export-options";
      export { formatLibraryTextExport } from "./src/features/library-export/format";
      export { LIBRARY_TEXT_EXPORT_FIELDS } from "./src/domain/library-export";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "library-export.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListLibraryExport",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `export function setIcon() {}`,
      }));
    },
  }],
});

const bundle = await readFile(path.join(output, "library-export.js"), "utf8");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body data-result="pending"><div id="fields"></div><script>window.createEl=(tag)=>document.createElement(tag);</script>
<script>${bundle}</script><script>
try {
  const selected = new Set(['mediaType', 'score']);
  AnimeListLibraryExport.renderLibraryExportTextFields(
    document.querySelector('#fields'),
    'text',
    selected,
    () => {},
  );
  const inputs = [...document.querySelectorAll('#fields input[type="checkbox"]')];
  const labels = [...document.querySelectorAll('#fields label')].map((node) => node.textContent.trim());
  const rows = [
    {
      time:'2026-05-03', work:'葬送的芙莉蓮', entryLabel:'13', entryUnit:'volume', mediaType:'manga',
      originalTitle:'', score:9, progressCurrent:13, progressUnit:'volume', startedAt:'',
      status:'completed', favorite:false, genres:[],
    },
    {
      time:'2026-06-12', work:'葬送的芙莉蓮', entryLabel:'14', entryUnit:'volume', mediaType:'manga',
      originalTitle:'', score:9, progressCurrent:14, progressUnit:'volume', startedAt:'',
      status:'completed', favorite:false, genres:[],
    },
  ];
  const text = AnimeListLibraryExport.formatLibraryTextExport(rows, selected);
  const details = {
    onlyOptionalFieldsAreCheckboxes: inputs.length === AnimeListLibraryExport.LIBRARY_TEXT_EXPORT_FIELDS.length && inputs.every((input) => !input.disabled),
    noFixedOrSerialCheckbox: !labels.some((label) => ['完成時間','作品','單位紀錄'].includes(label)),
    serialUsesTimelineTitle: text.includes('葬送的芙莉蓮 — 第 13 卷') && text.includes('葬送的芙莉蓮 — 第 14 卷'),
    readableEventSpacing: text.includes('  作品類型：漫畫\\n  評分：9\\n\\n2026-06-12'),
    noPipeTable: !text.includes('|'),
  };
  document.body.dataset.details = JSON.stringify(details);
  document.body.dataset.result = Object.values(details).every(Boolean) ? 'pass' : 'fail';
} catch (error) {
  document.body.dataset.details = String(error?.stack || error);
  document.body.dataset.result = 'fail';
}
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Library Export readable Text and optional field controls",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

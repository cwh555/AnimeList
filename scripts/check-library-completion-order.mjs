import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-completion-order");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { AnimeListUI } from "./src/ui/library-renderer";
      export { TimelineUI } from "./src/ui/timeline-renderer";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "library-completion-order.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListCompletionOrderTest",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(context) {
      context.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      context.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export class Menu { addItem() { return this; } showAtMouseEvent() {} }
        `,
      }));
    },
  }],
});

const bundle = await readFile(path.join(output, "library-completion-order.js"), "utf8");
const item = ({
  title,
  status = "completed",
  completedAt = "2026-08-20",
  updatedLabel = "UPDATED-LABEL",
  mediaType = "anime",
  unit = "episode",
  volumeLog = [],
}) => ({
  title,
  originalTitle: "",
  mediaType,
  format: mediaType === "anime" ? "tv" : "novel",
  status,
  releaseStatus: "finished",
  progress: 1,
  total: mediaType === "anime" ? 12 : 0,
  unit,
  score: 8,
  favorite: false,
  year: 2026,
  genres: [],
  people: [],
  platforms: [],
  sourceUrls: [],
  cover: "",
  filePath: `${title}.md`,
  updated: 123,
  updatedLabel,
  startedAt: "2026-08-01",
  completedAt,
  volumeLog,
});

const items = [
  item({ title: "作品 第十季" }),
  item({ title: "作品 第二季" }),
  item({ title: "作品 第一季" }),
  item({ title: "進行中作品", status: "ongoing", completedAt: "", updatedLabel: "UPDATED-ONGOING" }),
  item({ title: "舊資料完成作品", completedAt: "unknown", updatedLabel: "UPDATED-COMPLETED" }),
  item({
    title: "小說系列",
    mediaType: "novel",
    unit: "volume",
    completedAt: "",
    volumeLog: [
      { label: "10", startedAt: "", completedAt: "2026-08-20" },
      { label: "2", startedAt: "", completedAt: "2026-08-20" },
      { label: "1", startedAt: "", completedAt: "2026-08-20" },
    ],
  }),
];

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body data-result="pending"><div id="library"></div><div id="timeline"></div>
<script>
window.createEl = (tag) => document.createElement(tag);
if (!HTMLElement.prototype.setCssStyles) Object.defineProperty(HTMLElement.prototype, "setCssStyles", { value(styles) { Object.assign(this.style, styles); } });
</script>
<script>${bundle}</script>
<script>
const items = ${JSON.stringify(items)};
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const cardTitles = (root, selector = '.al-card.status-completed') => [...root.querySelectorAll(selector)]
  .map((card) => card.querySelector('.al-card-title')?.textContent || '');
const footerFor = (root, title) => [...root.querySelectorAll('.al-card')]
  .find((card) => card.querySelector('.al-card-title')?.textContent === title)
  ?.querySelector('.al-updated')?.textContent || '';

(async () => {
  const details = {};
  const library = document.querySelector('#library');
  const timeline = document.querySelector('#timeline');
  AnimeListCompletionOrderTest.AnimeListUI.renderLibrary(library, items, {
    presentation: 'workspace',
    initialState: { type: 'all', status: 'all', sort: 'completed-desc', view: 'grid' },
    requiresCompleteDom: () => true,
  });
  await frames();

  details.gridCompletedUsesCompletionDate = footerFor(library, '作品 第一季').includes('2026-08-20')
    && !footerFor(library, '作品 第一季').includes('UPDATED');
  details.gridOngoingUsesModifiedTime = footerFor(library, '進行中作品') === 'UPDATED-ONGOING';
  details.gridUnknownCompletionUsesUnknownDate = footerFor(library, '舊資料完成作品').length > 0
    && !footerFor(library, '舊資料完成作品').includes('UPDATED-COMPLETED');
  const sameDayGrid = cardTitles(library).filter((title) => title.startsWith('作品 第'));
  details.librarySameDayNaturalOrder = sameDayGrid.join('|') === '作品 第一季|作品 第二季|作品 第十季';

  const listButton = [...library.querySelectorAll('.al-view-button')].find((button) => button.dataset.icon === 'list');
  listButton?.click();
  await frames();
  details.listModeActivated = library.querySelector('.al-grid')?.classList.contains('is-list') === true;
  details.listCompletedUsesCompletionDate = footerFor(library, '作品 第二季').includes('2026-08-20')
    && !footerFor(library, '作品 第二季').includes('UPDATED');
  details.listOngoingUsesModifiedTime = footerFor(library, '進行中作品') === 'UPDATED-ONGOING';

  AnimeListCompletionOrderTest.TimelineUI.render(timeline, items, { openFile: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await frames();
  const timelineCards = [...timeline.querySelectorAll('.al-timeline-scene .al-timeline-card')];
  const seasonOrder = timelineCards
    .map((card) => card.querySelector('.al-timeline-card-copy strong')?.textContent || '')
    .filter((title) => title.startsWith('作品 第'));
  details.timelineSameDaySeasonOrder = seasonOrder.join('|') === '作品 第一季|作品 第二季|作品 第十季';
  const volumeOrder = timelineCards
    .filter((card) => card.querySelector('.al-timeline-card-copy strong')?.textContent === '小說系列')
    .map((card) => card.querySelector('.al-timeline-volume-label')?.textContent || '')
    .map((label) => label.match(/[0-9]+(?:\\.5)?|EX/i)?.[0] || label);
  details.timelineSameDayVolumeOrder = volumeOrder.join('|') === '1|2|10';

  document.body.dataset.details = JSON.stringify(details);
  document.body.dataset.result = Object.values(details).every(Boolean) ? 'pass' : 'fail';
})().catch((error) => {
  document.body.dataset.details = String(error?.stack || error);
  document.body.dataset.result = 'fail';
});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile: path.join(output, "chrome"),
    testName: "Library completion footer and same-day natural ordering",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1280, height: 900 },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

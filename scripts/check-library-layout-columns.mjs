import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-layout-columns");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { AnimeListUI } from "./src/ui/library-renderer";
      export { installLibraryLayoutControl } from "./src/ui/library-layout-controls";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "library-layout.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListLibraryLayout",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export function setIcon(parent, name) {
            parent.dataset.icon = name;
          }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "library-layout.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const fixture = () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root {
  --background-primary:#111;
  --background-primary-alt:#181818;
  --background-secondary:#222;
  --background-secondary-alt:#292929;
  --background-modifier-border:#444;
  --background-modifier-hover:#333;
  --interactive-accent:#7867e6;
  --text-normal:#eee;
  --text-muted:#aaa;
  --text-faint:#777;
  --text-on-accent:#fff;
}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}
body{overflow-x:auto}
button,input,select{font:inherit}
${styles}
#root{width:calc(100% - 24px);margin:12px}
</style></head><body data-result="pending"><div id="root"></div>
<script>
window.createEl = (tag) => document.createElement(tag);
if (!HTMLElement.prototype.setCssStyles) {
  HTMLElement.prototype.setCssStyles = function(styles) { Object.assign(this.style, styles); };
}
</script>
<script>${bundle}</script>
<script>
(async () => {
  try {
    const root = document.querySelector('#root');
    const stateChanges = [];
    const items = Array.from({ length: 12 }, (_, index) => ({
      title: 'Work ' + String(index + 1).padStart(2, '0'),
      originalTitle: '',
      mediaType: 'anime',
      format: 'tv',
      status: 'ongoing',
      releaseStatus: 'releasing',
      progress: index + 1,
      total: 12,
      unit: 'episode',
      score: null,
      favorite: false,
      year: 2026,
      genres: [],
      people: [],
      platforms: [],
      sourceUrls: [],
      cover: '',
      filePath: 'AnimeList/Anime/work-' + index + '.md',
      updated: index,
      updatedLabel: '',
      startedAt: '',
      completedAt: '',
      volumeLog: [],
    }));
    const initialState = {
      type: 'all',
      status: 'all',
      filters: { companies: [], quarter: '', tags: [] },
      sort: 'title-asc',
      view: 'grid',
    };

    let latestState = structuredClone(initialState);
    let layoutControl = null;
    const render = (state) => {
      latestState = structuredClone(state);
      AnimeListLibraryLayout.AnimeListUI.renderLibrary(root, items, {
        presentation: 'workspace',
        initialState: state,
        requiresCompleteDom: () => true,
        onStateChange: (next) => {
          latestState = { ...latestState, ...structuredClone(next) };
          stateChanges.push(structuredClone(latestState));
          layoutControl?.sync(latestState);
        },
      });
      layoutControl = AnimeListLibraryLayout.installLibraryLayoutControl(root, {
        initialState: latestState,
        onColumnsChange: (layoutColumns) => {
          latestState = { ...latestState, layoutColumns: structuredClone(layoutColumns) };
          stateChanges.push(structuredClone(latestState));
          layoutControl?.sync(latestState);
        },
      });
    };
    render(initialState);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const tracks = () => getComputedStyle(root.querySelector('.al-grid')).gridTemplateColumns
      .split(' ').filter(Boolean).length;
    const clickViewByIcon = (icon) => {
      const button = [...root.querySelectorAll('.al-view-button')]
        .find((candidate) => candidate.dataset.icon === icon);
      if (!button) throw new Error('Missing view button: ' + icon);
      button.click();
    };
    const slider = () => root.querySelector('.al-library-column-control input[type="range"]');
    const output = () => root.querySelector('.al-library-column-value');
    const control = () => root.querySelector('.al-library-column-control');
    const firstCard = root.querySelector('.al-card');

    const details = {};
    details.defaultGridFour = slider()?.value === '4' && output()?.textContent === '4' && tracks() === 4;

    slider().value = '5';
    slider().dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.gridFiveImmediate = tracks() === 5 && output()?.textContent === '5';
    details.sliderDoesNotRebuildCards = root.querySelector('.al-card') === firstCard;
    details.gridStateRecorded = latestState.layoutColumns?.grid === 5 && latestState.layoutColumns?.poster === 3;

    clickViewByIcon('image');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.posterRemembersOwnThree = slider()?.value === '3' && output()?.textContent === '3' && tracks() === 3;

    slider().value = '2';
    slider().dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.posterTwoImmediate = tracks() === 2
      && latestState.layoutColumns?.grid === 5
      && latestState.layoutColumns?.poster === 2;

    clickViewByIcon('layout-grid');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.gridReturnsToFive = slider()?.value === '5' && tracks() === 5;

    clickViewByIcon('list');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.listHidesScale = control()?.hidden === true && tracks() === 1;

    clickViewByIcon('layout-grid');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const stateBeforeRerender = structuredClone(latestState);
    render(stateBeforeRerender);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    details.rerenderPersistsGridFive = slider()?.value === '5' && tracks() === 5;
    clickViewByIcon('image');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    details.rerenderPersistsPosterTwo = slider()?.value === '2' && tracks() === 2;

    const layoutControls = root.querySelector('.al-view-switch');
    const controlsRect = layoutControls.getBoundingClientRect();
    details.controlsFitViewport = controlsRect.left >= -1
      && controlsRect.right <= document.documentElement.clientWidth + 1;
    details.noPageOverflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    details.rangeAccessible = slider()?.min === '1'
      && slider()?.max === '6'
      && slider()?.step === '1'
      && Boolean(slider()?.getAttribute('aria-label'));
    details.stateChangesObserved = stateChanges.length >= 6;
    const toolbarRect = root.querySelector('.al-toolbar').getBoundingClientRect();
    details.geometry = 'viewport=' + document.documentElement.clientWidth + ', scroll=' + document.documentElement.scrollWidth + ', controls=' + controlsRect.left.toFixed(1) + '..' + controlsRect.right.toFixed(1) + ', toolbar=' + toolbarRect.left.toFixed(1) + '..' + toolbarRect.right.toFixed(1);

    const pass = Object.entries(details).filter(([key]) => key !== 'geometry').every(([, value]) => Boolean(value));
    document.body.dataset.details = JSON.stringify(details);
    document.body.dataset.result = pass ? 'pass' : 'fail';
  } catch (error) {
    document.body.dataset.details = error?.stack || String(error);
    document.body.dataset.result = 'fail';
  }
})();
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "desktop-profile"),
    testName: "Library exact-column controls desktop",
    viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "mobile-profile"),
    testName: "Library exact-column controls mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

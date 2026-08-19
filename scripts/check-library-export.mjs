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
      export { LibraryExportModal } from "./src/ui/library-export-modal";
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
        contents: `
          export class Modal {
            constructor(app) {
              this.app = app;
              this.modalEl = document.createElement("div");
              this.modalEl.className = "modal";
              this.titleEl = document.createElement("h2");
              this.titleEl.className = "modal-title";
              this.contentEl = document.createElement("div");
              this.contentEl.className = "modal-content";
              this.modalEl.append(this.titleEl, this.contentEl);
            }
            open() { document.body.appendChild(this.modalEl); this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice { constructor(message) { (window.__notices ||= []).push(String(message)); } }
          export class TFile {}
          export function normalizePath(value) { return String(value || ""); }
          export function setIcon() {}
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "library-export.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const item = ({ title, mediaType, completedAt, unit, volumeLog = [], score = 9 }) => ({
  title,
  originalTitle: title + " original",
  mediaType,
  format: mediaType,
  status: "completed",
  releaseStatus: mediaType === "anime" ? "unknown" : "finished",
  progress: mediaType === "anime" ? 12 : 14,
  total: mediaType === "anime" ? 12 : 0,
  unit,
  score,
  favorite: false,
  year: 2026,
  genres: ["Drama"],
  people: [],
  platforms: [],
  sourceUrls: [],
  cover: "",
  filePath: "AnimeList/" + mediaType + "/" + title + ".md",
  updated: 0,
  updatedLabel: "",
  startedAt: "2026-01-01",
  completedAt,
  volumeLog,
});

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#171717;--background-secondary:#202020;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8070df;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;--font-monospace:ui-monospace,monospace;}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}button,input,select,textarea{font:inherit}
.modal{margin:12px auto;padding:18px;border:1px solid #444;border-radius:12px;background:#181818}.modal-title{margin:0 0 8px}
${styles}
</style></head><body data-result="pending">
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
</script><script>${bundle}</script><script>
(async()=>{
try {
  const items = [
    ${JSON.stringify(item({title:"Anime Done",mediaType:"anime",completedAt:"2026-02-10",unit:"episode"}))},
    ${JSON.stringify(item({title:"葬送的芙莉蓮",mediaType:"manga",completedAt:"2026-06-20",unit:"volume",volumeLog:[{label:"13",startedAt:"2026-05-01",completedAt:"2026-05-03"},{label:"14",startedAt:"2026-06-10",completedAt:"2026-06-12"}]}))},
  ];
  let creates = [];
  const host = {
    app: {
      vault: {
        getAbstractFileByPath(){ return null; },
        async create(path, content){ creates.push({path,content}); return {path}; },
      },
      metadataCache: { getFileCache(){ return null; } },
    },
    settings: { libraryRoot: "AnimeList" },
    collectMediaItems(){ return items; },
    async ensureFolder(){},
    async uniqueFilePath(folder, base, extension){ return folder + "/" + base + "." + extension; },
  };

  let contentReplaceCalls = 0;
  const originalReplaceChildren = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function(...nodes) {
    if (this.classList?.contains("modal-content")) contentReplaceCalls += 1;
    return originalReplaceChildren.apply(this, nodes);
  };

  const modal = new AnimeListLibraryExport.LibraryExportModal(host);
  modal.open();
  const replacesAfterOpen = contentReplaceCalls;
  const content = modal.contentEl;
  const preview = content.querySelector(".al-library-export-preview");
  const layout = content.querySelector(".al-library-export-layout");
  const controls = content.querySelector(".al-library-export-controls");
  const textButton = [...content.querySelectorAll(".al-library-export-format")].find((button)=>button.textContent.trim()==="Text");
  const jsonButton = [...content.querySelectorAll(".al-library-export-format")].find((button)=>button.textContent.trim()==="JSON");
  const scopeSelects = [...content.querySelectorAll(".al-library-export-scope select")];

  textButton.click();
  const fieldsSection = content.querySelector(".al-library-export-fields-section");
  const checkboxInputs = [...content.querySelectorAll(".al-library-export-checkbox input")];
  const checkboxLabels = [...content.querySelectorAll(".al-library-export-checkbox")].map((node)=>node.textContent.trim());
  const scoreLabel = [...content.querySelectorAll(".al-library-export-checkbox")].find((node)=>node.textContent.includes("評分"));
  const scoreCheckbox = scoreLabel?.querySelector("input");
  scoreCheckbox?.focus();
  scoreCheckbox?.click();
  const focusedAfterCheckbox = document.activeElement === scoreCheckbox;

  scopeSelects[0].value = "manga";
  scopeSelects[0].dispatchEvent(new Event("change", { bubbles:true }));
  const previewAfterManga = preview.value;
  jsonButton.click();
  textButton.click();

  const controlsRect = controls.getBoundingClientRect();
  const previewSectionRect = content.querySelector(".al-library-export-preview-section").getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const modalRect = modal.modalEl.getBoundingClientRect();
  const isMobile = innerWidth <= 760;
  const details = {
    noContentRerenderAfterInteractions: contentReplaceCalls === replacesAfterOpen,
    stableContentNode: modal.contentEl === content && content.querySelector(".al-library-export-preview") === preview,
    stableControlsNode: content.querySelector(".al-library-export-controls") === controls,
    checkboxFocusPreserved: focusedAfterCheckbox,
    onlyOptionalFieldsAreCheckboxes: checkboxInputs.length === AnimeListLibraryExport.LIBRARY_TEXT_EXPORT_FIELDS.length && checkboxInputs.every((input)=>!input.disabled),
    fixedFieldsAbsentFromOptions: !checkboxLabels.some((label)=>["完成時間","作品","單位紀錄"].includes(label)),
    serialUsesTimelineTitle: previewAfterManga.includes("葬送的芙莉蓮 — 第 13 卷") && previewAfterManga.includes("葬送的芙莉蓮 — 第 14 卷"),
    readableSpacing: previewAfterManga.includes("第 13 卷") && previewAfterManga.includes("\\n\\n2026-06-12"),
    noPipeTable: !previewAfterManga.includes("|"),
    textOptionsVisibilityStable: fieldsSection && !fieldsSection.hidden,
    responsiveLayout: isMobile
      ? previewSectionRect.top >= controlsRect.bottom - 1
      : previewSectionRect.left >= controlsRect.right - 1,
    previewFitsViewport: previewRect.right <= innerWidth + 1 && modalRect.right <= innerWidth + 1,
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
  };
  document.body.dataset.details = JSON.stringify(details);
  document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
} catch (error) {
  document.body.dataset.details = String(error?.stack || error);
  document.body.dataset.result = "fail";
}
})();
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile: path.join(profile, "desktop"),
    testName: "Library Export stable controls and spacious desktop layout",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1100, height: 850, deviceScaleFactor: 1 },
  });
  await runChromiumDatasetTest({
    html,
    profile: path.join(profile, "mobile"),
    testName: "Library Export stable controls and responsive mobile layout",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

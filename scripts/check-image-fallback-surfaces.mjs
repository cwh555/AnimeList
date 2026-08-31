import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "image-fallback-surfaces");
await mkdir(output, { recursive: true });
const desktopProfile = path.join(output, "chrome-profile-desktop");
const mobileProfile = path.join(output, "chrome-profile-mobile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { AddMediaModal } from "./src/ui/media-modals";
      export { DetailActionsRenderChild } from "./src/ui/markdown-renderers";
      export { ReleaseTrackingManagerModal } from "./src/ui/release-tracking-manager-modal";
      export { ReleaseTrackingDashboardModal } from "./src/ui/release-tracking-dashboard-modal";
      export { ReleaseTrackingResultsModal } from "./src/ui/release-tracking-modal";
      export { serialEntryCoversFeature } from "./src/features/serial-covers/feature";
      export { READING_EDITOR_STATE_KEY } from "./src/features/progress/additional-progress-units";
      export { TFile } from "obsidian";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "bundle.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageFallbacks",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export class TAbstractFile { constructor(path = "") { this.path = path; this.name = String(path).split("/").pop() || ""; } }
          export class TFile extends TAbstractFile {
            constructor(path = "") { super(path); this.basename = String(path).split("/").pop()?.replace(/\\.md$/i, "") || ""; this.extension = "md"; }
          }
          export class TFolder extends TAbstractFile { constructor(path = "") { super(path); this.children = []; } }
          export class App {}
          export class MarkdownRenderChild {
            constructor(containerEl) { this.containerEl = containerEl; }
            registerEvent() {}
            registerDomEvent(target, type, listener) { target.addEventListener(type, listener); }
          }
          export class Modal {
            constructor(app) {
              this.app = app;
              this.modalEl = document.createElement("div");
              this.modalEl.className = "modal";
              this.contentEl = document.createElement("div");
              this.contentEl.className = "modal-content";
              this.modalEl.appendChild(this.contentEl);
            }
            setTitle(value) { this.title = value; }
            open() { document.body.appendChild(this.modalEl); this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice { constructor(message) { (window.__notices ||= []).push(String(message)); } }
          export class MenuItem {
            setTitle(value) { this.title = value; return this; }
            setIcon(value) { this.icon = value; return this; }
            setWarning(value = true) { this.warning = value; return this; }
            onClick(callback) { this.callback = callback; return this; }
          }
          export class Menu {
            constructor() { this.items = []; }
            addItem(callback) { const item = new MenuItem(); callback(item); this.items.push(item); return this; }
            showAtMouseEvent() { return this; }
          }
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export function normalizePath(value) { return String(value || ""); }
          export function debounce(fn) { return fn; }
          export async function requestUrl() { throw new Error("requestUrl unavailable in browser fixture"); }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "bundle.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#202020;--background-secondary-alt:#292929;--background-primary-alt:#181818;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8170df;--interactive-accent-hover:#9486e8;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;--text-on-accent:#fff;--font-ui-small:13px;--font-ui-smaller:12px;--font-ui-medium:15px}
html,body{margin:0;background:#111;color:#eee;font-family:sans-serif}button,input,select,textarea{font:inherit}${styles}
</style></head><body data-result="pending"><div id="root"></div>
<script>
window.createEl=(tag,info)=>{const el=document.createElement(tag); if(typeof info==='string')el.className=info; else if(info){if(info.cls)el.className=info.cls;if(info.text!==undefined)el.textContent=info.text;} return el;};
window.createDiv=(info)=>window.createEl('div',info); window.createSpan=(info)=>window.createEl('span',info);
for(const [name,fn] of Object.entries({
 addClass:function(...n){this.classList.add(...n)}, removeClass:function(...n){this.classList.remove(...n)},
 toggleClass:function(n,f){this.classList.toggle(n,f)}, empty:function(){this.replaceChildren()},
 setText:function(v){this.textContent=String(v??'')}, setCssStyles:function(v){Object.assign(this.style,v)},
 createDiv:function(info){const e=window.createDiv(info);this.appendChild(e);return e},
 createSpan:function(info){const e=window.createSpan(info);this.appendChild(e);return e},
 createEl:function(tag,info){const e=window.createEl(tag,info);this.appendChild(e);return e},
 createSvg:function(tag){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);this.appendChild(e);return e},
})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn});
</script><script>${bundle}</script><script>
(async()=>{
 const details={};
 const root=document.querySelector('#root');
 const broken='data:image/png;base64,not-a-valid-image';
 const baseResult={provider:'Bangumi',sourceId:'x',mediaType:'anime',title:'Broken cover',originalTitle:'Original',romajiTitle:'',year:'2024',format:'TV',coverUrl:broken,genres:[],rawGenres:[],classification:{},releaseStatus:'unknown',total:'',unit:'episode',searchTitles:[]};
 const host={
   app:{workspace:{openLinkText:async()=>{}},vault:{getAbstractFileByPath:()=>null},metadataCache:{on:()=>({}),getFileCache:()=>null}},
   settings:{tagCatalog:[]}, collectMediaItems:()=>[], afterSearchRender:()=>{}, searchExternal:async()=>({results:[],warnings:[]}),
   getTemplates:()=>new Promise(()=>{}), enrichExternalMedia:()=>new Promise(()=>{}), configureMediaForm:()=>{}, prepareMediaSubmit:async()=>{},
   createMediaNote:async()=>({path:'x.md'}), afterDetailRender:()=>{}, resolveMediaCoverPath:(cover)=>cover, openLibrary:async()=>{},
 };
 const modal=new AnimeListImageFallbacks.AddMediaModal(host,'anime'); root.appendChild(modal.modalEl);
 const row=modal.createResultRow(baseResult); root.appendChild(row); const rowImg=row.querySelector('img'); rowImg?.dispatchEvent(new Event('error'));
 details.collectSearchFallback=!row.querySelector('img') && !!row.querySelector('.al-search-result-placeholder');
 const selectedPromise=modal.renderDetails({...baseResult,sourceId:'selected'}); const selected=modal.contentEl.querySelector('.al-selected-preview'); const selectedImg=selected?.querySelector('img'); selectedImg?.dispatchEvent(new Event('error'));
 details.collectSelectedFallback=!!selected && !selected.querySelector('img') && !!selected.querySelector('.al-search-result-placeholder');
 modal.manualCoverFile=new File([new Uint8Array([1,2,3])],'broken.png',{type:'image/png'}); const manualPromise=modal.renderManualDetails('anime'); const manual=modal.contentEl.querySelector('.al-manual-cover-preview'); const manualImg=manual?.querySelector('img'); manualImg?.dispatchEvent(new Event('error'));
 details.collectManualFallback=!!manual && !manual.querySelector('img') && !!manual.querySelector('.al-manual-cover-preview-missing');
 void selectedPromise; void manualPromise;

 const detailHost={
   app:{
     vault:{getAbstractFileByPath:(p)=>new AnimeListImageFallbacks.TFile(p)},
     metadataCache:{on:()=>({}),getFileCache:()=>({frontmatter:{media_type:'manga',title:'Detail',cover:broken,status:'reading',progress:'1',total:'10',unit:'chapter'}})},
   },
   resolveMediaCoverPath:(cover)=>cover, afterDetailRender:()=>{}, openLibrary:async()=>{},
 };
 const detailContainer=document.createElement('div'); root.appendChild(detailContainer); const detail=new AnimeListImageFallbacks.DetailActionsRenderChild(detailContainer,detailHost,'Manga/Detail.md'); detail.render(); const detailImg=detailContainer.querySelector('.al-detail-cover img'); detailImg?.dispatchEvent(new Event('error'));
 details.markdownDetailFallback=!detailContainer.querySelector('.al-detail-cover img') && !!detailContainer.querySelector('.al-detail-cover-missing');

 const snapshot={status:'verified',binding:{provider:'mangadex'},latest:'12',latestReleaseDate:'',sourceLabel:'Demo',checkedAt:'',error:''};
 const item={filePath:'Manga/Demo.md',title:'Demo',mediaType:'manga',status:'reading',progress:'3',cover:broken,coverSources:{src:broken,srcset:''},score:null,year:'2024',genres:[],userTags:[]};
 const state={read:()=>snapshot,hasExplicitStatus:()=>true,enable:async()=>{},disable:async()=>{}}; const service={state};
 const manager=new AnimeListImageFallbacks.ReleaseTrackingManagerModal({},service,[item],{onApplied:()=>{}}); root.appendChild(manager.modalEl); manager.onOpen(); const managerImg=manager.contentEl.querySelector('.al-release-manager-cover img'); managerImg?.dispatchEvent(new Event('error'));
 details.releaseManagerFallback=!manager.contentEl.querySelector('.al-release-manager-cover img') && !!manager.contentEl.querySelector('.al-release-manager-cover [data-icon="book-open"]');
 const dashActions={refreshAll:async()=>({}),cancelRefreshAll:()=>{},refreshItem:async()=>({}),reviewItem:()=>{},openMedia:async()=>{},onChanged:()=>{}};
 const dashboard=new AnimeListImageFallbacks.ReleaseTrackingDashboardModal({},service,[item],dashActions); root.appendChild(dashboard.modalEl); dashboard.onOpen(); const dashImg=dashboard.contentEl.querySelector('.al-release-dashboard-cover img'); dashImg?.dispatchEvent(new Event('error'));
 details.releaseDashboardFallback=!dashboard.contentEl.querySelector('.al-release-dashboard-cover img') && !!dashboard.contentEl.querySelector('.al-release-dashboard-cover [data-icon="book-open"]');
 const resultsActions={cancel:()=>{},reviewItem:()=>{},openMedia:async()=>{},close:()=>{}}; const results=new AnimeListImageFallbacks.ReleaseTrackingResultsModal({},resultsActions); root.appendChild(results.modalEl); results.onOpen(); results.showProgress({completed:1,total:2,provider:'mangadex',item}); const runningImg=results.contentEl.querySelector('.al-release-running-cover img'); runningImg?.dispatchEvent(new Event('error'));
 details.releaseRunningFallback=!results.contentEl.querySelector('.al-release-running-cover img') && !!results.contentEl.querySelector('.al-release-running-cover [data-icon="book-open"]');

 const editor=document.createElement('section'); editor.className='al-volume-editor'; editor.innerHTML='<div class="al-volume-row"><div class="al-volume-row-fields"><input type="text" value="1"></div></div>'; root.appendChild(editor);
 const reading={entries:[{label:'1',cover:broken}],editor,originalTitle:'Serial',listeners:new Set()};
 const formState=new Map([[AnimeListImageFallbacks.READING_EDITOR_STATE_KEY,reading]]);
 const form={state:formState,mediaType:'manga',result:{originalTitle:'Serial',searchTitles:[]},frontmatter:{},host:{resolveMediaCoverPath:(cover)=>cover,releaseDownloadedCover:()=>{},settings:{googleBooksApiKey:''}},form:{file:{path:'Manga/Serial.md'}},onDispose:()=>()=>{}};
 const serialContribution=AnimeListImageFallbacks.serialEntryCoversFeature.contributions.find((entry)=>entry.kind==='media-form'); serialContribution.configure(form); const serialImg=editor.querySelector('.al-serial-cover-button img'); serialImg?.dispatchEvent(new Event('error'));
 details.serialEditorFallback=!editor.querySelector('.al-serial-cover-button img') && !!editor.querySelector('.al-serial-cover-button [data-icon="image-off"]');
 details.serialEditorStatus=editor.querySelector('.al-serial-cover-status')?.textContent?.trim().length>0;

 const all=Object.values(details).every(Boolean); document.body.dataset.details=JSON.stringify(details); document.body.dataset.result=all?'pass':'fail';
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile: desktopProfile,
    testName: "AnimeList image fallback surfaces (desktop)",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1000, height: 800, deviceScaleFactor: 1 },
    resultTimeoutMs: 12000,
  });
  await runChromiumDatasetTest({
    html,
    profile: mobileProfile,
    testName: "AnimeList image fallback surfaces (mobile)",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    resultTimeoutMs: 12000,
  });
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

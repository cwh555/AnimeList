import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "moments-stacked");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { MomentsRenderChild } from "./src/ui/moments-renderer";
      export { MomentEditorModal } from "./src/ui/moments-modal";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "moments-stacked.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListMomentsStacked",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export class MarkdownRenderChild {
            constructor(containerEl) { this.containerEl = containerEl; }
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
          export class TFile {}
          export class MenuItem {
            setTitle() { return this; } setIcon() { return this; } setWarning() { return this; }
            onClick(callback) { this.callback = callback; return this; }
          }
          export class Menu {
            addItem(callback) { callback(new MenuItem()); return this; }
            showAtMouseEvent() { return this; }
          }
          export function normalizePath(value) { return String(value || ""); }
          export async function requestUrl() { throw new Error("requestUrl unavailable in browser fixture"); }
          export function setIcon(parent, name) { parent.dataset.icon = name; }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "moments-stacked.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const svg = (label, width, height, base, band) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${base}"/><rect y="${Math.floor(height * 0.76)}" width="100%" height="${Math.ceil(height * 0.24)}" fill="${band}"/><text x="50%" y="90%" dominant-baseline="middle" text-anchor="middle" font-size="34" fill="white">${label} subtitle</text></svg>`)}`;
const a = svg("A", 960, 540, "#4e6380", "#171717");
const b = svg("B", 960, 540, "#805f72", "#202020");
const c = svg("C", 540, 760, "#52735c", "#151515");

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#202020;--background-secondary-alt:#292929;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8170df;--interactive-accent-hover:#9486e8;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;--text-on-accent:#fff;--font-ui-small:13px;--font-ui-smaller:12px;--font-ui-medium:15px;}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}button,input,textarea{font:inherit}
/* Match the Obsidian constraint that feature image buttons must explicitly override. */
button:not(.clickable-icon){height:32px;background:#292929;box-shadow:0 1px 2px rgba(0,0,0,.35)}
${styles}
#reading{width:370px;margin:8px}.modal{box-sizing:border-box;width:370px;margin:8px;padding:8px;background:#181818}.modal-content{max-height:720px;overflow-y:auto}
</style></head><body class="is-mobile" data-result="pending"><section id="reading"></section>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
</script><script>${bundle}</script><script>
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const urls={"a.png":"${a}","b.png":"${b}","c.png":"${c}"};
const service={
 resolve:(path)=>({resourcePath:urls[path]}),
 fetchRemoteAsset:async()=>{throw new Error("unused")},
};
const context={sourcePath:"Anime/Demo.md",getSectionInfo:()=>({lineStart:0,lineEnd:14})};
const host={app:{}};
const source=[
 "moments:",
 '  - id: "m_stack123"',
 "    text: stacked subtitle fixture",
 "    imageLayout: stacked",
 "    stackReveal: 56",
 "    stackFocusY:",
 "      - 50",
 "      - 82",
 "      - 93",
 "    images:",
 '      - "a.png"',
 '      - "b.png"',
 '      - "c.png"',
].join("\\n");
const renderer=new AnimeListMomentsStacked.MomentsRenderChild(document.querySelector("#reading"),host,{},service,source,context);
renderer.onload();
(async()=>{
 await delay(120);
 const details={};
 const reading=document.querySelector("#reading");
 const stack=reading.querySelector(".al-moment-stack-reading");
 const top=stack?.querySelector(".al-moment-stack-top");
 const strips=[...(stack?.querySelectorAll(".al-moment-stack-strip")||[])];
 details.readingUsesRealStack=Boolean(stack) && !reading.querySelector(".al-moment-image-row") && strips.length===2;
 details.topImageIsExpanded=Boolean(top) && top.getBoundingClientRect().height>150;
 details.revealHeightPersists=strips.every(strip=>Math.abs(strip.getBoundingClientRect().height-56)<=1);
 details.focusMetadataControlsCrop=getComputedStyle(strips[0].querySelector("img")).objectPosition.includes("82%")
   && getComputedStyle(strips[1].querySelector("img")).objectPosition.includes("93%");
 details.mobileReadingDoesNotOverflow=document.documentElement.scrollWidth<=window.innerWidth+1;

 let saved=null;
 const initial={id:"m_stack123",text:"stacked subtitle fixture",imageLayout:"stacked",stackReveal:56,stackFocusY:[50,82,93],images:["a.png","b.png","c.png"]};
 const modal=new AnimeListMomentsStacked.MomentEditorModal({},service,"Anime/Demo.md",initial,async input=>{saved=input});
 modal.open();
 await delay(80);
 details.editorStartsInStackedMode=modal.contentEl.querySelector('.al-moment-editor-layout-mode.is-active')?.textContent?.length>0
   && modal.contentEl.querySelectorAll('.al-moment-stack-editor .al-moment-stack-strip').length===2;
 const reveal=modal.contentEl.querySelector('.al-moment-editor-reveal input[type="range"]');
 reveal.value="64"; reveal.dispatchEvent(new Event("input",{bubbles:true}));
 details.revealSliderUpdatesLive=Math.abs(modal.contentEl.querySelector('.al-moment-stack-strip').getBoundingClientRect().height-64)<=1;
 const strip=modal.contentEl.querySelectorAll('.al-moment-stack-editor .al-moment-stack-strip')[0];
 const before=getComputedStyle(strip.querySelector('img')).objectPosition;
 const rect=strip.getBoundingClientRect();
 const x=rect.left+rect.width/2, y=rect.top+rect.height/2;
 const pointer=(type,clientY)=>strip.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:17,pointerType:"touch",isPrimary:true,clientX:x,clientY,button:0,buttons:type==="pointerup"?0:1}));
 pointer("pointerdown",y); pointer("pointermove",y-42); pointer("pointerup",y-42); await delay(20);
 const after=getComputedStyle(strip.querySelector('img')).objectPosition;
 details.touchDragAdjustsSubtitleFocus=before!==after && after.includes("100%");
 details.touchDragKeepsPageStable=document.documentElement.scrollWidth<=window.innerWidth+1;
 const save=modal.contentEl.querySelector('.al-moment-editor-actions .mod-cta');
 save.click(); await delay(20);
 details.editorPersistsManualLayout=Boolean(saved) && saved.imageLayout==="stacked" && saved.stackReveal===64
   && saved.stackFocusY?.[0]===50 && saved.stackFocusY?.[1]===100 && saved.stackFocusY?.[2]===93;

 const legacyInitial={id:"m_legacy123",text:"legacy",images:["a.png","b.png"]};
 const legacy=new AnimeListMomentsStacked.MomentEditorModal({},service,"Anime/Demo.md",legacyInitial,async()=>{});
 legacy.open(); await delay(20);
 details.legacyDefaultsToCarousel=legacy.contentEl.querySelector('.al-moment-editor-layout-mode.is-active')?.textContent!==""
   && !legacy.contentEl.querySelector('.al-moment-stack-editor');
 legacy.close();
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?"pass":"fail";
})().catch(error=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result="fail"});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Moments stacked subtitle layout and touch adjustment",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

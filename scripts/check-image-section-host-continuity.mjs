import { createServer } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-host-continuity";
const profile = `${output}/profile`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const slowImage = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#4b6788"/></svg>`;
const server = createServer((request, response) => {
  if (!request.url?.startsWith("/slow.svg")) {
    response.writeHead(404).end();
    return;
  }
  setTimeout(() => {
    response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    response.end(slowImage);
  }, 240);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not bind slow image server");
const slowImageUrl = `http://127.0.0.1:${address.port}/slow.svg`;

await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: `export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${output}/bundle.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageContinuityTest",
  target: "es2022",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export class MarkdownRenderChild { constructor(containerEl){ this.containerEl=containerEl; } registerDomEvent(target,type,listener){target.addEventListener(type,listener);} }
          export class Modal { constructor(app){this.app=app;this.modalEl=document.createElement("div");this.contentEl=document.createElement("div");this.modalEl.appendChild(this.contentEl);} setTitle(){} open(){this.onOpen?.();} close(){this.onClose?.();this.modalEl.remove();} }
          export class Notice {}
          export class TFile {}
          export function normalizePath(value){return String(value||"");}
          export async function requestUrl(){throw new Error("unused");}
          export class MenuItem { setTitle(){return this} setIcon(){return this} setWarning(){return this} onClick(){return this} }
          export class Menu { addItem(callback){callback(new MenuItem());return this} showAtMouseEvent(){return this} }
          export function setIcon(parent){parent.dataset.icon="1";}
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(`${output}/bundle.js`, "utf8"),
  readFile("styles.css", "utf8"),
]);
const readyPixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%23666'/%3E%3C/svg%3E";
const slowImageUrlJs = JSON.stringify(slowImageUrl);
const readyPixelJs = JSON.stringify(readyPixel);
const html = `<!doctype html><html><head><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}${styles}
#scroll-shell{height:420px;overflow:auto}.spacer{height:720px}#preview{width:360px;margin:0 20px}.host-raw{display:block;min-height:220px;width:100%;box-sizing:border-box;margin:0;padding:0;background:#f0f;color:#000}.animelist-image-section{min-height:220px}
#preview > .animelist-image-section{background-color:rgb(12,34,56)}body > .animelist-image-section{background-color:rgb(200,0,0)}
</style></head><body data-result="pending"><div id="scroll-shell"><div class="spacer"></div><div id="preview"></div><div class="spacer"></div></div>
<script>
window.addEventListener("error",(event)=>{document.body.dataset.details=String(event.error?.stack||event.message||"window error");document.body.dataset.result="fail";});
window.addEventListener("unhandledrejection",(event)=>{document.body.dataset.details=String(event.reason?.stack||event.reason||"unhandled rejection");document.body.dataset.result="fail";});
let viewTransitionCalls=0;Object.defineProperty(document,"startViewTransition",{value:()=>{viewTransitionCalls+=1;throw new Error("ViewTransition forbidden");},configurable:true});
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({addClass:function(...x){this.classList.add(...x)},removeClass:function(...x){this.classList.remove(...x)},toggleClass:function(n,v){this.classList.toggle(n,v)}})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
 const api=AnimeListImageContinuityTest,preview=document.querySelector('#preview'),scroll=document.querySelector('#scroll-shell');
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
 const sourceFor=(paths)=>paths.map((path)=>'- '+path).join('\\n');
 const sectionText=(paths)=>String.fromCharCode(96).repeat(3)+'animelist-images\\n'+sourceFor(paths)+'\\n'+String.fromCharCode(96).repeat(3);
 const context={sourcePath:'Demo.md',getSectionInfo:()=>({lineStart:10,lineEnd:20,text:sectionText(currentPaths)})};
 const host={app:{}};
 let currentPaths=['ready-a.jpg','ready-b.jpg'];
 const service={
   resolve:(path)=>({resourcePath:path.startsWith('slow-')?${slowImageUrlJs}+'?p='+encodeURIComponent(path):${readyPixelJs}+'#'+path}),
   setColumns:async()=>({source:sourceFor(currentPaths),lineStart:10,lineEnd:20}),
   setSectionOrders:async()=>[{source:sourceFor(currentPaths),lineStart:10,lineEnd:20}],
   setAsCover:async()=>{},removeMany:async()=>sourceFor(currentPaths),addAssets:async()=>({source:sourceFor(currentPaths),duplicatesSkipped:0}),
   fetchRemoteAsset:async()=>{throw new Error('unused')},
 };
 const makeSection=()=>{const el=document.createElement('section');el.className='image-section-host';return el;};
 const overlay=()=>document.querySelector('[data-image-continuity-overlay="true"]');
 const overlayCount=()=>document.querySelectorAll('[data-image-continuity-overlay="true"]').length;
 const hitInside=(section)=>{const rect=section.getBoundingClientRect();const hit=document.elementFromPoint(rect.left+40,rect.top+40);return Boolean(hit&&section.contains(hit));};
 const covered=(surface,visual)=>{if(!visual)return false;const a=surface.getBoundingClientRect(),b=visual.getBoundingClientRect();return Math.abs(a.left-b.left)<=1&&Math.abs(a.top-b.top)<=1&&Math.abs(a.width-b.width)<=1;};

 // Normal Obsidian path: old child unloads, raw Markdown host is paintable, then a new container mounts.
 let section=makeSection();preview.appendChild(section);let renderer=new api.ImageSectionRenderChild(section,host,service,sourceFor(currentPaths),context);renderer.onload();
 await delay(30);scroll.scrollTop=650;await nextFrame();
 const expectedContextColor=getComputedStyle(section).backgroundColor;
 renderer.onunload();
 const firstOverlay=overlay();
 const contextStylePreserved=Boolean(firstOverlay)&&getComputedStyle(firstOverlay).backgroundColor===expectedContextColor;
 const overlaySharesMarkdownParent=firstOverlay?.parentElement===preview;
 const raw=document.createElement('pre');raw.className='host-raw';raw.textContent='RAW MARKDOWN HOST';section.replaceWith(raw);
 let coveredRawFrames=0,pointerTransparentFrames=0;
 for(let i=0;i<10;i+=1){await nextFrame();const visual=overlay();if(covered(raw,visual))coveredRawFrames+=1;if(visual&&getComputedStyle(visual).pointerEvents==='none')pointerTransparentFrames+=1;}
 currentPaths=['slow-new-a.jpg','slow-new-b.jpg','slow-added.jpg'];
 const fresh=makeSection();raw.replaceWith(fresh);section=fresh;renderer=new api.ImageSectionRenderChild(fresh,host,service,sourceFor(currentPaths),context);renderer.onload();
 await nextFrame();
 let normalUnreadyCovered=0,normalFreshHit=0;
 for(let i=0;i<4;i+=1){const visual=overlay();if(covered(fresh,visual))normalUnreadyCovered+=1;if(hitInside(fresh))normalFreshHit+=1;await nextFrame();}
 await delay(300);await nextFrame();const normalReadyOverlayRemoved=overlayCount()===0;

 // Same-container rebind: successor onload happens before old child onunload.
 currentPaths=['ready-same-a.jpg','ready-same-b.jpg'];
 const same=makeSection();preview.appendChild(same);const oldSame=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);oldSame.onload();await delay(30);
 currentPaths=['slow-same-a.jpg','slow-same-b.jpg','slow-same-added.jpg'];
 const successor=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);successor.onload();
 await nextFrame();
 const sameContainerHandoffCreated=overlayCount()===1;
 const sameContainerContextPreserved=Boolean(overlay())&&overlay().parentElement===preview&&getComputedStyle(overlay()).backgroundColor===expectedContextColor;
 let sameUnreadyCovered=0,sameFreshHit=0;
 for(let i=0;i<4;i+=1){const visual=overlay();if(covered(same,visual))sameUnreadyCovered+=1;if(hitInside(same))sameFreshHit+=1;await nextFrame();}
 const countBeforeLateUnload=overlayCount();oldSame.onunload();const countAfterLateUnload=overlayCount();
 const lateOldUnloadDoesNotCreateGhost=countBeforeLateUnload===1&&countAfterLateUnload===1;
 await delay(300);await nextFrame();const sameReadyOverlayRemoved=overlayCount()===0;
 successor.onunload();await delay(750); // let the unclaimed unload handoff self-release

 const checks={
   contextStylePreserved,
   overlaySharesMarkdownParent,
   rawHostGapCovered:coveredRawFrames===10,
   rawHostOverlayPointerTransparent:pointerTransparentFrames===10,
   replacementStaysCoveredUntilImagesReady:normalUnreadyCovered===4,
   replacementRemainsInteractiveUnderOverlay:normalFreshHit===4,
   normalReadyOverlayRemoved,
   changedPathSuccessorClaimsHandoff:normalUnreadyCovered===4,
   sameContainerReplacementGetsVisualHandoff:sameContainerHandoffCreated,
   sameContainerContextPreserved,
   sameContainerStaysCoveredUntilImagesReady:sameUnreadyCovered===4,
   sameContainerFreshRendererHitTestable:sameFreshHit===4,
   lateOldRendererUnloadDoesNotCreateGhost:lateOldUnloadDoesNotCreateGhost,
   sameContainerReadyOverlayRemoved:sameReadyOverlayRemoved,
   viewTransitionCalls:viewTransitionCalls===0,
 };
 const details={...checks,coveredRawFrames,pointerTransparentFrames,normalUnreadyCovered,normalFreshHit,sameUnreadyCovered,sameFreshHit,countBeforeLateUnload,countAfterLateUnload};
 document.body.dataset.details=JSON.stringify(details);document.body.dataset.result=Object.values(checks).every(Boolean)?'pass':'fail';
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail';});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section renderer host continuity",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 720 },
    resultTimeoutMs: 15000,
  });
} finally {
  server.close();
  await rm(output, { recursive: true, force: true });
  stop();
}

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
    contents: `
      export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";
      export * as continuity from "./src/ui/image-section-continuity";
    `,
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
          export class MenuItem { setTitle(){return this} setIcon(){return this} setWarning(){return this} onClick(callback){this.callback=callback;return this} }
          export class Menu { addItem(callback){const item=new MenuItem();callback(item);return this} showAtMouseEvent(){return this} }
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
#scroll-shell{height:420px;overflow:auto}.spacer{height:720px}#preview{width:360px;margin:0 20px}.host-raw{display:block;min-height:220px;width:100%;box-sizing:border-box;margin:8px 0 22px;padding:10px;background:#f0f;color:#000}.animelist-image-section{min-height:220px}
#preview > .animelist-image-section{background-color:rgb(12,34,56)}body > .animelist-image-section{background-color:rgb(200,0,0)}
</style></head><body data-result="pending"><div id="scroll-shell"><div class="spacer"></div><div id="preview" class="markdown-preview-view"></div><div class="spacer"></div></div>
<script>
window.addEventListener("error",(event)=>{document.body.dataset.details=String(event.error?.stack||event.message||"window error");document.body.dataset.result="fail";});
window.addEventListener("unhandledrejection",(event)=>{document.body.dataset.details=String(event.reason?.stack||event.reason||"unhandled rejection");document.body.dataset.result="fail";});
let viewTransitionCalls=0;Object.defineProperty(document,"startViewTransition",{value:()=>{viewTransitionCalls+=1;throw new Error("ViewTransition forbidden");},configurable:true});
let decodeCalls=0;const nativeDecode=HTMLImageElement.prototype.decode;if(nativeDecode)Object.defineProperty(HTMLImageElement.prototype,"decode",{configurable:true,value:function(){decodeCalls+=1;return nativeDecode.call(this);}});
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({addClass:function(...x){this.classList.add(...x)},removeClass:function(...x){this.classList.remove(...x)},toggleClass:function(n,v){this.classList.toggle(n,v)}})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
 const api=AnimeListImageContinuityTest,preview=document.querySelector('#preview'),scroll=document.querySelector('#scroll-shell');
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
 const sourceFor=(paths)=>paths.map((path)=>'- '+path).join('\\n');
 const sectionText=(paths)=>String.fromCharCode(96).repeat(3)+'animelist-images\\n'+sourceFor(paths)+'\\n'+String.fromCharCode(96).repeat(3);
 let currentPaths=['ready-a.jpg','ready-b.jpg'];
 const context={sourcePath:'Demo.md',getSectionInfo:()=>({lineStart:10,lineEnd:20,text:sectionText(currentPaths)})};
 const host={app:{}};
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
 const waitImages=async(container)=>{await Promise.all([...container.querySelectorAll('img')].map((image)=>image.decode?.().catch(()=>{})));await nextFrame();await nextFrame();};
 const samplePixel=(image)=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].join(',');};

 // Real Obsidian ordering: arm before the note write, DOM detaches, then onunload fires.
 let section=makeSection();preview.appendChild(section);let renderer=new api.ImageSectionRenderChild(section,host,service,sourceFor(currentPaths),context);renderer.onload();
 scroll.scrollTop=650;await waitImages(section);
 const oldImage=section.querySelector('img');const oldPixel=samplePixel(oldImage);const oldRect=section.getBoundingClientRect();
 const expectedContextColor=getComputedStyle(section).backgroundColor;
 api.continuity.armImageSectionHostContinuity?.(section,context.sourcePath,currentPaths,10);
 const raw=document.createElement('pre');raw.className='host-raw';raw.textContent='RAW MARKDOWN HOST';section.replaceWith(raw);
 await Promise.resolve(); // MutationObserver rescues the already-painted descendants before rendering.
 renderer.onunload();
 const firstOverlay=overlay();
 const overlayImage=firstOverlay?.querySelector('img');
 const contextStylePreserved=Boolean(firstOverlay)&&getComputedStyle(firstOverlay).backgroundColor===expectedContextColor;
 const overlaySharesMarkdownParent=firstOverlay?.parentElement===preview;
 const overlayPreservesPaintedImageNode=overlayImage===oldImage;
 const overlayPixel=overlayImage?samplePixel(overlayImage):'';
 const rawHostOverlayHasPaintedPixels=overlayPixel===oldPixel&&overlayPixel.endsWith(',255');
 let coveredRawFrames=0,pointerTransparentFrames=0;
 for(let i=0;i<10;i+=1){await nextFrame();const visual=overlay();if(covered(raw,visual))coveredRawFrames+=1;if(visual&&getComputedStyle(visual).pointerEvents==='none')pointerTransparentFrames+=1;}

 currentPaths=['slow-new-a.jpg','slow-new-b.jpg','slow-added.jpg'];
 const fresh=makeSection();raw.replaceWith(fresh);section=fresh;renderer=new api.ImageSectionRenderChild(fresh,host,service,sourceFor(currentPaths),context);renderer.onload();
 await nextFrame();
 let normalUnreadyCovered=0,normalFreshHit=0;
 for(let i=0;i<4;i+=1){const visual=overlay();if(covered(fresh,visual))normalUnreadyCovered+=1;if(hitInside(fresh))normalFreshHit+=1;await nextFrame();}
 await delay(320);await nextFrame();await nextFrame();const normalReadyOverlayRemoved=overlayCount()===0;

 // Parent-wrapper replacement: observing the immediate parent is insufficient because
 // Obsidian may detach the whole code-block wrapper in one mutation.
 currentPaths=['ready-parent-a.jpg','ready-parent-b.jpg'];
 const oldBlock=document.createElement('div');oldBlock.className='block-language-animelist-images';
 const parentSection=makeSection();oldBlock.appendChild(parentSection);preview.appendChild(oldBlock);
 let parentRenderer=new api.ImageSectionRenderChild(parentSection,host,service,sourceFor(currentPaths),context);parentRenderer.onload();await waitImages(parentSection);
 const parentOldImage=parentSection.querySelector('img');
 api.continuity.armImageSectionHostContinuity?.(parentSection,context.sourcePath,currentPaths,10);
 const rawBlock=document.createElement('div');rawBlock.className='block-language-animelist-images';
 const parentRaw=document.createElement('pre');parentRaw.className='host-raw';parentRaw.textContent='WHOLE BLOCK REPLACED';rawBlock.appendChild(parentRaw);
 oldBlock.replaceWith(rawBlock);await Promise.resolve();parentRenderer.onunload();
 const parentOverlay=overlay();
 const parentReplacementObservedBeforeUnload=Boolean(parentOverlay);
 const disconnectedParentContextRecreated=parentOverlay?.parentElement?.classList.contains('block-language-animelist-images')===true&&parentOverlay.parentElement.parentElement===preview;
 const parentReplacementPreservesPaintedImageNode=parentOverlay?.querySelector('img')===parentOldImage;
 currentPaths=['ready-parent-next.jpg'];
 const newBlock=document.createElement('div');newBlock.className='block-language-animelist-images';const parentFresh=makeSection();newBlock.appendChild(parentFresh);rawBlock.replaceWith(newBlock);
 parentRenderer=new api.ImageSectionRenderChild(parentFresh,host,service,sourceFor(currentPaths),context);parentRenderer.onload();await waitImages(parentFresh);await nextFrame();await nextFrame();
 const parentReplacementCleansAfterClaim=overlayCount()===0;
 parentRenderer.onunload();

 // Same-container rebind: old painted descendants must move to the handoff before successor render mutates the container.
 currentPaths=['ready-same-a.jpg','ready-same-b.jpg'];
 const same=makeSection();preview.appendChild(same);same.scrollIntoView({block:'center'});await nextFrame();const oldSame=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);oldSame.onload();await waitImages(same);
 const oldSameImage=same.querySelector('img');
 currentPaths=['slow-same-a.jpg','slow-same-b.jpg','slow-same-added.jpg'];
 const successor=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);successor.onload();
 await nextFrame();
 const sameContainerHandoffCreated=overlayCount()===1;
 const sameOverlay=overlay();
 const sameContainerPreservesPaintedImageNode=sameOverlay?.querySelector('img')===oldSameImage;
 const sameContainerContextPreserved=Boolean(sameOverlay)&&sameOverlay.parentElement===preview&&getComputedStyle(sameOverlay).backgroundColor===expectedContextColor;
 let sameUnreadyCovered=0,sameFreshHit=0;
 for(let i=0;i<4;i+=1){const visual=overlay();if(covered(same,visual))sameUnreadyCovered+=1;if(hitInside(same))sameFreshHit+=1;await nextFrame();}
 const countBeforeLateUnload=overlayCount();oldSame.onunload();const countAfterLateUnload=overlayCount();
 const lateOldUnloadDoesNotCreateGhost=countBeforeLateUnload===1&&countAfterLateUnload===1;
 await delay(320);await nextFrame();await nextFrame();const sameReadyOverlayRemoved=overlayCount()===0;
 successor.onunload();

 // Non-move note persistence must use the same pre-write continuity hook (column change).
 currentPaths=['ready-column-a.jpg','ready-column-b.jpg'];
 const columnSection=makeSection();preview.appendChild(columnSection);columnSection.scrollIntoView({block:'center'});await nextFrame();
 let columnRenderer=new api.ImageSectionRenderChild(columnSection,host,service,sourceFor(currentPaths),context);columnRenderer.onload();await waitImages(columnSection);
 const originalSetColumns=service.setColumns;
 let columnRaw=null;
 service.setColumns=async()=>{
   columnRaw=document.createElement('pre');columnRaw.className='host-raw';columnRaw.textContent='COLUMN WRITE RAW';
   columnSection.replaceWith(columnRaw);await Promise.resolve();columnRenderer.onunload();
   return {source:sourceFor(currentPaths),lineStart:10,lineEnd:20};
 };
 const range=columnSection.querySelector('input[type="range"]');range.value='2';range.dispatchEvent(new Event('change',{bubbles:true}));
 await Promise.resolve();await nextFrame();
 const columnPersistenceWasPrearmed=overlayCount()===1&&Boolean(columnRaw)&&covered(columnRaw,overlay());
 service.setColumns=originalSetColumns;
 await delay(1550); // no successor: armed/visual state must self-clean.
 const abandonedContinuitySelfCleans=overlayCount()===0;

 const checks={
   contextStylePreserved,
   overlaySharesMarkdownParent,
   overlayPreservesPaintedImageNode,
   rawHostOverlayHasPaintedPixels,
   rawHostGapCovered:coveredRawFrames===10,
   rawHostOverlayPointerTransparent:pointerTransparentFrames===10,
   replacementStaysCoveredUntilImagesDecoded:normalUnreadyCovered===4,
   replacementRemainsInteractiveUnderOverlay:normalFreshHit===4,
   normalReadyOverlayRemoved,
   changedPathSuccessorClaimsHandoff:normalUnreadyCovered===4,
   parentReplacementObservedBeforeUnload,
   disconnectedParentContextRecreated,
   parentReplacementPreservesPaintedImageNode,
   parentReplacementCleansAfterClaim,
   sameContainerReplacementGetsVisualHandoff:sameContainerHandoffCreated,
   sameContainerContextPreserved,
   sameContainerPreservesPaintedImageNode,
   sameContainerStaysCoveredUntilImagesDecoded:sameUnreadyCovered===4,
   sameContainerFreshRendererHitTestable:sameFreshHit===4,
   lateOldRendererUnloadDoesNotCreateGhost:lateOldUnloadDoesNotCreateGhost,
   sameContainerReadyOverlayRemoved:sameReadyOverlayRemoved,
   successorVisibleImagesAreDecoded:decodeCalls>=6,
   columnPersistenceWasPrearmed,
   abandonedContinuitySelfCleans,
   sourceRectWasVisible:oldRect.width>0&&oldRect.height>0,
   viewTransitionCalls:viewTransitionCalls===0,
 };
 const details={...checks,coveredRawFrames,pointerTransparentFrames,normalUnreadyCovered,normalFreshHit,sameUnreadyCovered,sameFreshHit,countBeforeLateUnload,countAfterLateUnload,decodeCalls,oldPixel,overlayPixel};
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

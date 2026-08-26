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
const html = `<!doctype html><html><head><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}${styles}
#scroll-shell{height:420px;overflow:auto}.spacer{height:720px}#preview{width:360px;margin:0 20px}.host-raw{display:block;min-height:220px;width:100%;box-sizing:border-box;margin:8px 0 22px;padding:10px;background:#f0f;color:#000}.animelist-image-section{min-height:220px}
#preview .animelist-image-section{background-color:rgb(12,34,56)}body > .animelist-image-section{background-color:rgb(200,0,0)}
</style></head><body data-result="pending"><div id="scroll-shell"><div class="spacer"></div><div id="preview" class="markdown-preview-view"></div><div class="spacer"></div></div>
<script>
window.addEventListener("error",(event)=>{document.body.dataset.details=String(event.error?.stack||event.message||"window error");document.body.dataset.result="fail";});
window.addEventListener("unhandledrejection",(event)=>{document.body.dataset.details=String(event.reason?.stack||event.reason||"unhandled rejection");document.body.dataset.result="fail";});
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({addClass:function(...x){this.classList.add(...x)},removeClass:function(...x){this.classList.remove(...x)},toggleClass:function(n,v){this.classList.toggle(n,v)}})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
 const api=AnimeListImageContinuityTest,preview=document.querySelector("#preview"),scroll=document.querySelector("#scroll-shell");
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
 const sourceFor=(paths)=>paths.map((path)=>"- "+path).join("\\n");
 const sectionText=(paths)=>String.fromCharCode(96).repeat(3)+"animelist-images\\n"+sourceFor(paths)+"\\n"+String.fromCharCode(96).repeat(3);
 let currentPaths=[];
 const context={sourcePath:"Demo.md",getSectionInfo:()=>({lineStart:10,lineEnd:20,text:sectionText(currentPaths)})};
 const host={app:{}};
 const service={
   resolve:(path)=>({resourcePath:path.startsWith("slow-")?${JSON.stringify(slowImageUrl)}+"?p="+encodeURIComponent(path):${JSON.stringify(readyPixel)}+"#"+path}),
   setColumns:async()=>({source:sourceFor(currentPaths),lineStart:10,lineEnd:20}),
   setSectionOrders:async()=>[{source:sourceFor(currentPaths),lineStart:10,lineEnd:20}],
   setAsCover:async()=>{},removeMany:async()=>sourceFor(currentPaths),addAssets:async()=>({source:sourceFor(currentPaths),duplicatesSkipped:0}),
   fetchRemoteAsset:async()=>{throw new Error("unused")},
 };
 const makeSection=()=>{const el=document.createElement("section");el.className="image-section-host";return el;};
 const parked=()=>document.querySelector("[data-image-continuity-surface='true'],[data-image-continuity-overlay='true']");
 const parkedCount=()=>document.querySelectorAll("[data-image-continuity-surface='true'],[data-image-continuity-overlay='true']").length;
 const visibleSectionCount=()=>[...document.querySelectorAll(".animelist-image-section")].filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;}).length;
 const covered=(surface,visual)=>{if(!visual)return false;const a=surface.getBoundingClientRect(),b=visual.getBoundingClientRect();return Math.abs(a.left-b.left)<=1&&Math.abs(a.top-b.top)<=1&&Math.abs(a.width-b.width)<=1;};
 const waitImages=async(container)=>{await Promise.all([...container.querySelectorAll("img")].map((image)=>image.decode?.().catch(()=>{})));await nextFrame();await nextFrame();};
 const imageFor=(container,path)=>container.querySelector('.al-image-item[data-image-path="'+path+'"] img');
 const cleanupRenderer=(renderer,element)=>{renderer?.onunload?.();element?.remove?.();};

 // Normal Obsidian replacement: keep one parked surface during the raw-host gap,
 // then synchronously consume it before the successor becomes the visible surface.
 currentPaths=["ready-a.jpg","ready-b.jpg","ready-c.jpg"];
 let section=makeSection();preview.appendChild(section);let renderer=new api.ImageSectionRenderChild(section,host,service,sourceFor(currentPaths),context);renderer.onload();
 scroll.scrollTop=650;await waitImages(section);
 const oldA=imageFor(section,"ready-a.jpg"),oldB=imageFor(section,"ready-b.jpg"),expectedContextColor=getComputedStyle(section).backgroundColor;
 api.continuity.armImageSectionHostContinuity(section,context.sourcePath,currentPaths,10);
 const raw=document.createElement("pre");raw.className="host-raw";raw.textContent="RAW MARKDOWN HOST";section.replaceWith(raw);await Promise.resolve();renderer.onunload();
 const parkedBeforeSuccessor=parked();
 const parkedUsesMarkdownContext=Boolean(parkedBeforeSuccessor)&&getComputedStyle(parkedBeforeSuccessor).backgroundColor===expectedContextColor;
 const parkedKeepsOldImage=parkedBeforeSuccessor?.querySelector(".al-image-item[data-image-path='ready-a.jpg'] img")===oldA;
 let gapCovered=0,gapSingleSurface=0;
 for(let i=0;i<6;i+=1){await nextFrame();if(covered(raw,parked()))gapCovered+=1;if(visibleSectionCount()===1)gapSingleSurface+=1;}
 currentPaths=["ready-c.jpg","ready-a.jpg","ready-b.jpg"];
 const fresh=makeSection();raw.replaceWith(fresh);section=fresh;renderer=new api.ImageSectionRenderChild(fresh,host,service,sourceFor(currentPaths),context);renderer.onload();
 const normalSurfaceReleasedSynchronously=parkedCount()===0;
 const normalReusesA=imageFor(fresh,"ready-a.jpg")===oldA;
 const normalReusesB=imageFor(fresh,"ready-b.jpg")===oldB;
 let normalSingleSurfaceFrames=0;
 for(let i=0;i<6;i+=1){await nextFrame();if(visibleSectionCount()===1&&parkedCount()===0)normalSingleSurfaceFrames+=1;}
 cleanupRenderer(renderer,fresh);

 // A changed-path successor may introduce a slow image, but unchanged painted
 // images are transferred and the old complete surface must still disappear
 // before the successor can paint.
 currentPaths=["ready-x.jpg","ready-y.jpg"];
 const changedOld=makeSection();preview.appendChild(changedOld);let changedRenderer=new api.ImageSectionRenderChild(changedOld,host,service,sourceFor(currentPaths),context);changedRenderer.onload();await waitImages(changedOld);
 const oldX=imageFor(changedOld,"ready-x.jpg");
 api.continuity.armImageSectionHostContinuity(changedOld,context.sourcePath,currentPaths,10);
 const changedRaw=document.createElement("pre");changedRaw.className="host-raw";changedOld.replaceWith(changedRaw);await Promise.resolve();changedRenderer.onunload();
 currentPaths=["ready-y.jpg","slow-added.jpg","ready-x.jpg"];
 const changedFresh=makeSection();changedRaw.replaceWith(changedFresh);changedRenderer=new api.ImageSectionRenderChild(changedFresh,host,service,sourceFor(currentPaths),context);changedRenderer.onload();
 const changedPathSurfaceReleasedSynchronously=parkedCount()===0;
 const changedPathReusesExistingImage=imageFor(changedFresh,"ready-x.jpg")===oldX;
 let changedPathSingleSurfaceFrames=0;
 for(let i=0;i<4;i+=1){if(visibleSectionCount()===1&&parkedCount()===0)changedPathSingleSurfaceFrames+=1;await nextFrame();}
 await delay(300);cleanupRenderer(changedRenderer,changedFresh);

 // Whole code-block wrapper replacement must use the same single-surface rule.
 currentPaths=["ready-parent-a.jpg","ready-parent-b.jpg"];
 const oldBlock=document.createElement("div");oldBlock.className="block-language-animelist-images";const parentSection=makeSection();oldBlock.appendChild(parentSection);preview.appendChild(oldBlock);
 let parentRenderer=new api.ImageSectionRenderChild(parentSection,host,service,sourceFor(currentPaths),context);parentRenderer.onload();await waitImages(parentSection);const parentImage=imageFor(parentSection,"ready-parent-a.jpg");
 api.continuity.armImageSectionHostContinuity(parentSection,context.sourcePath,currentPaths,10);
 const rawBlock=document.createElement("div");rawBlock.className="block-language-animelist-images";const parentRaw=document.createElement("pre");parentRaw.className="host-raw";rawBlock.appendChild(parentRaw);oldBlock.replaceWith(rawBlock);await Promise.resolve();parentRenderer.onunload();
 const parentParkedBeforeSuccessor=Boolean(parked());
 currentPaths=["ready-parent-b.jpg","ready-parent-a.jpg"];
 const newBlock=document.createElement("div");newBlock.className="block-language-animelist-images";const parentFresh=makeSection();newBlock.appendChild(parentFresh);rawBlock.replaceWith(newBlock);parentRenderer=new api.ImageSectionRenderChild(parentFresh,host,service,sourceFor(currentPaths),context);parentRenderer.onload();
 const parentSingleSurfaceAfterClaim=parkedCount()===0&&visibleSectionCount()===1;
 const parentReusesImage=imageFor(parentFresh,"ready-parent-a.jpg")===parentImage;
 cleanupRenderer(parentRenderer,newBlock);

 // Same-container rebind is especially prone to the screenshot bug: the old
 // full surface must be consumed before the successor render returns.
 currentPaths=["ready-same-a.jpg","ready-same-b.jpg"];
 const same=makeSection();preview.appendChild(same);same.scrollIntoView({block:"center"});await nextFrame();const oldSame=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);oldSame.onload();await waitImages(same);const sameA=imageFor(same,"ready-same-a.jpg");
 currentPaths=["ready-same-b.jpg","ready-same-a.jpg"];
 const successor=new api.ImageSectionRenderChild(same,host,service,sourceFor(currentPaths),context);successor.onload();
 const sameContainerSurfaceReleasedSynchronously=parkedCount()===0;
 const sameContainerSingleSurfaceImmediately=visibleSectionCount()===1;
 const sameContainerReusesImage=imageFor(same,"ready-same-a.jpg")===sameA;
 let sameSingleSurfaceFrames=0;
 for(let i=0;i<6;i+=1){await nextFrame();if(visibleSectionCount()===1&&parkedCount()===0)sameSingleSurfaceFrames+=1;}
 const beforeLateUnload=parkedCount();oldSame.onunload();const afterLateUnload=parkedCount();
 const lateOldUnloadNoGhost=beforeLateUnload===0&&afterLateUnload===0;
 cleanupRenderer(successor,same);

 // Non-move persistence still pre-arms, and an abandoned parked surface cleans itself.
 currentPaths=["ready-column-a.jpg","ready-column-b.jpg"];
 const columnSection=makeSection();preview.appendChild(columnSection);columnSection.scrollIntoView({block:"center"});await nextFrame();let columnRenderer=new api.ImageSectionRenderChild(columnSection,host,service,sourceFor(currentPaths),context);columnRenderer.onload();await waitImages(columnSection);
 const originalSetColumns=service.setColumns;let columnRaw=null;
 service.setColumns=async()=>{columnRaw=document.createElement("pre");columnRaw.className="host-raw";columnSection.replaceWith(columnRaw);await Promise.resolve();columnRenderer.onunload();return {source:sourceFor(currentPaths),lineStart:10,lineEnd:20};};
 const range=columnSection.querySelector("input[type='range']");range.value="2";range.dispatchEvent(new Event("change",{bubbles:true}));await Promise.resolve();await nextFrame();
 const columnPersistenceWasPrearmed=parkedCount()===1&&Boolean(columnRaw)&&covered(columnRaw,parked());
 service.setColumns=originalSetColumns;await delay(850);const abandonedContinuitySelfCleans=parkedCount()===0;columnRaw?.remove();

 const checks={
   parkedUsesMarkdownContext,
   parkedKeepsOldImage,
   rawGapCovered:gapCovered===6,
   rawGapHasSingleVisibleSurface:gapSingleSurface===6,
   normalSurfaceReleasedSynchronously,
   normalReusesA,
   normalReusesB,
   normalNeverShowsDuplicateSurface:normalSingleSurfaceFrames===6,
   changedPathSurfaceReleasedSynchronously,
   changedPathReusesExistingImage,
   changedPathNeverShowsDuplicateSurface:changedPathSingleSurfaceFrames===4,
   parentParkedBeforeSuccessor,
   parentSingleSurfaceAfterClaim,
   parentReusesImage,
   sameContainerSurfaceReleasedSynchronously,
   sameContainerSingleSurfaceImmediately,
   sameContainerReusesImage,
   sameContainerNeverShowsDuplicateSurface:sameSingleSurfaceFrames===6,
   lateOldUnloadNoGhost,
   columnPersistenceWasPrearmed,
   abandonedContinuitySelfCleans,
 };
 const details={...checks,gapCovered,gapSingleSurface,normalSingleSurfaceFrames,changedPathSingleSurfaceFrames,sameSingleSurfaceFrames,beforeLateUnload,afterLateUnload};
 document.body.dataset.details=JSON.stringify(details);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result="fail";});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section single-surface host continuity",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 720 },
    resultTimeoutMs: 15000,
  });
} finally {
  server.close();
  await rm(output, { recursive: true, force: true });
  stop();
}

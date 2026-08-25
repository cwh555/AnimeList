import { mkdir, readFile, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-host-continuity";
const profile = `${output}/profile`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: `
      export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";
      export { withImageSectionHostContinuity } from "./src/ui/image-section-continuity";
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
          export class MarkdownRenderChild {
            constructor(containerEl) { this.containerEl = containerEl; }
            registerDomEvent(target, type, listener) { target.addEventListener(type, listener); }
          }
          export class Modal {
            constructor(app) { this.app = app; this.modalEl = document.createElement("div"); this.contentEl = document.createElement("div"); this.modalEl.appendChild(this.contentEl); }
            setTitle() {}
            open() { this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice {}
          export class TFile {}
          export function normalizePath(value) { return String(value || ""); }
          export async function requestUrl() { throw new Error("unused"); }
          export class MenuItem { setTitle(){return this} setIcon(){return this} setWarning(){return this} onClick(){return this} }
          export class Menu { addItem(callback){callback(new MenuItem());return this} showAtMouseEvent(){return this} }
          export function setIcon(parent) { parent.dataset.icon = "1"; }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(`${output}/bundle.js`, "utf8"),
  readFile("styles.css", "utf8"),
]);
const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%23666'/%3E%3C/svg%3E";
const html = `<!doctype html><html><head><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}${styles}
#scroll-shell{height:420px;overflow:auto}.spacer{height:720px}#preview{width:360px;margin:0 20px}.host-raw{display:block;min-height:220px;width:100%;box-sizing:border-box;margin:0;padding:0;background:#f0f;color:#000}
.animelist-image-section{min-height:220px}
</style></head><body data-result="pending"><div id="scroll-shell"><div class="spacer"></div><div id="preview"></div><div class="spacer"></div></div>
<script>
Object.defineProperty(document,"startViewTransition",{value:undefined,configurable:true});
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...x){this.classList.add(...x)},
 removeClass:function(...x){this.classList.remove(...x)},
 toggleClass:function(n,v){this.classList.toggle(n,v)},
})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
 const api=AnimeListImageContinuityTest;
 const preview=document.querySelector('#preview');
 const scroll=document.querySelector('#scroll-shell');
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const paths=['a.jpg','b.jpg','c.jpg'];
 const source=()=>paths.map((path)=>'- '+path).join('\\n');
 const context={sourcePath:'Demo.md',getSectionInfo:()=>({lineStart:10,lineEnd:14,text:String.fromCharCode(96).repeat(3)+'animelist-images\\n'+source()+'\\n'+String.fromCharCode(96).repeat(3)})};
 const host={app:{}};
 const service={
   resolve:(path)=>({resourcePath:"${pixel}#"+path}),
   setColumns:async()=>({source:source(),lineStart:10,lineEnd:14}),
   setSectionOrders:async()=>[{source:source(),lineStart:10,lineEnd:14}],
   setAsCover:async()=>{}, removeMany:async()=>source(), addAssets:async()=>({source:source(),duplicatesSkipped:0}),
   fetchRemoteAsset:async()=>{throw new Error('unused')},
 };
 const makeSection=()=>{const el=document.createElement('section');el.className='image-section-host';return el;};
 const hitInside=(section)=>{const rect=section.getBoundingClientRect();const hit=document.elementFromPoint(rect.left+Math.min(40,rect.width/2),rect.top+Math.min(40,rect.height/2));return Boolean(hit&&section.contains(hit));};

 // Control proves that the raw host is actually paintable without continuity.
 let control=makeSection();control.style.height='220px';control.style.background='#333';preview.appendChild(control);scroll.scrollTop=650;await nextFrame();
 const rawControl=document.createElement('pre');rawControl.className='host-raw';rawControl.textContent='RAW MARKDOWN HOST';control.replaceWith(rawControl);
 let controlRawFrames=0;
 for(let i=0;i<6;i+=1){await nextFrame();if(rawControl.isConnected&&!document.querySelector('[data-image-continuity-overlay="true"]'))controlRawFrames+=1;}
 rawControl.remove();

 let section=makeSection();preview.appendChild(section);
 let renderer=new api.ImageSectionRenderChild(section,host,service,source(),context);renderer.onload();
 await nextFrame();
 let immediateHitFrames=0,preservedScrollFrames=0,rawFrames=0,coveredRawFrames=0,overlayPointerTransparentFrames=0,freshHitFrames=0,freshOverlayFrames=0;
 let rendererUnloadPreparesContinuity=false;

 const result=await api.withImageSectionHostContinuity([{
   container:section,sourcePath:'Demo.md',expectedPaths:paths,lineStart:10,
 }],async()=>{
   for(let i=0;i<12;i+=1){await nextFrame();if(hitInside(section))immediateHitFrames+=1;}
   scroll.scrollTop=650;
   for(let i=0;i<16;i+=1){await nextFrame();if(Math.abs(scroll.scrollTop-650)<=1)preservedScrollFrames+=1;}

   renderer.onunload();
   rendererUnloadPreparesContinuity=Boolean(document.querySelector('[data-image-continuity-overlay="true"]'));
   const raw=document.createElement('pre');raw.className='host-raw';raw.textContent='RAW MARKDOWN HOST';section.replaceWith(raw);
   for(let i=0;i<10;i+=1){
     await nextFrame();rawFrames+=1;
     const overlay=document.querySelector('[data-image-continuity-overlay="true"]');
     if(overlay){
       const rr=raw.getBoundingClientRect(),or=overlay.getBoundingClientRect();
       if(Math.abs(rr.left-or.left)<=1&&Math.abs(rr.top-or.top)<=1&&Math.abs(rr.width-or.width)<=1)coveredRawFrames+=1;
       if(getComputedStyle(overlay).pointerEvents==='none')overlayPointerTransparentFrames+=1;
     }
   }

   const fresh=makeSection();raw.replaceWith(fresh);section=fresh;
   renderer=new api.ImageSectionRenderChild(fresh,host,service,source(),context);renderer.onload();
   await nextFrame();
   for(let i=0;i<6;i+=1){
     if(document.querySelector('[data-image-continuity-overlay="true"]'))freshOverlayFrames+=1;
     if(hitInside(fresh))freshHitFrames+=1;
     await nextFrame();
   }
   return 'saved';
 });

 const details={controlRawFrames,result,rendererUnloadPreparesContinuity,immediateHitFrames,preservedScrollFrames,rawFrames,coveredRawFrames,overlayPointerTransparentFrames,freshHitFrames,freshOverlayFrames};
 const checks={
   controlReproducesRawHost:controlRawFrames===6,
   updateCompletes:result==='saved',
   rendererUnloadPreparesContinuity,
   imageSectionRemainsInteractiveBeforeUnload:immediateHitFrames===12,
   continuityDoesNotLockScroll:preservedScrollFrames===16,
   rawGapFullyCovered:rawFrames===10&&coveredRawFrames===10,
   overlayNeverCapturesPointer:overlayPointerTransparentFrames===10,
   freshRendererImmediatelyInteractive:freshHitFrames===6,
   staleOverlayDoesNotCoverFreshRenderer:freshOverlayFrames===0,
   documentViewTransitionIsNotUsed:typeof document.startViewTransition==='undefined',
 };
 renderer.onunload();
 document.body.dataset.details=JSON.stringify({...checks,...details});
 document.body.dataset.result=Object.values(checks).every(Boolean)?'pass':'fail';
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
  await rm(output, { recursive: true, force: true });
  stop();
}

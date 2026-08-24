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
    contents: `export { withImageSectionHostContinuity, prepareImageSectionHostUnload, claimImageSectionHostContinuity } from "./src/ui/image-section-continuity";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${output}/bundle.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageContinuityTest",
  target: "es2022",
});

const bundle = await readFile(`${output}/bundle.js`, "utf8");
const html = `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee}
#scroll-shell{height:420px;overflow:auto}.spacer{height:720px}
#preview{width:360px;margin:0 20px}.image-section{height:220px;width:100%;box-sizing:border-box;background:#333;position:relative}
.image-section button{position:absolute;left:20px;top:20px;width:120px;height:44px}.host-raw{display:block;height:220px;width:100%;box-sizing:border-box;margin:0;padding:0;background:#f0f;color:#000}
</style></head><body data-result="pending"><div id="scroll-shell"><div class="spacer"></div><div id="preview"></div><div class="spacer"></div></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...x){this.classList.add(...x)},
 removeClass:function(...x){this.classList.remove(...x)},
 toggleClass:function(n,v){this.classList.toggle(n,v)},
 setCssStyles:function(styles){Object.assign(this.style,styles)},
 createSpan:function(options={}){const el=document.createElement('span');if(options.cls)el.className=options.cls;this.appendChild(el);return el;},
})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
 const api=AnimeListImageContinuityTest;
 const preview=document.querySelector('#preview');
 const scroll=document.querySelector('#scroll-shell');
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const sectionMarkup=()=>{const section=document.createElement('section');section.className='image-section';section.innerHTML='<button type="button">image action</button>';return section;};
 const hitInside=(section)=>{const rect=section.getBoundingClientRect();const hit=document.elementFromPoint(rect.left+40,rect.top+40);return Boolean(hit && section.contains(hit));};

 let control=sectionMarkup();preview.appendChild(control);scroll.scrollTop=650;await nextFrame();
 const rawControl=document.createElement('pre');rawControl.className='host-raw';rawControl.textContent='RAW MARKDOWN HOST';control.replaceWith(rawControl);
 let controlRawFrames=0;
 for(let i=0;i<6;i+=1){await nextFrame();if(rawControl.isConnected && !document.querySelector('[data-image-continuity-overlay="true"]'))controlRawFrames+=1;}
 rawControl.remove();

 let section=sectionMarkup();preview.appendChild(section);await nextFrame();
 let viewTransitionCalls=0;
 const originalStart=document.startViewTransition;
 if(typeof originalStart==='function') document.startViewTransition=(...args)=>{viewTransitionCalls+=1;return originalStart.apply(document,args);};

 const paths=['a.jpg','b.jpg','c.jpg'];
 let immediateHitFrames=0;
 let preservedScrollFrames=0;
 let rawFrames=0;
 let coveredRawFrames=0;
 let overlayPointerTransparentFrames=0;
 let freshHitFrames=0;
 let freshOverlayFrames=0;

 const operation=api.withImageSectionHostContinuity([{
   container:section,sourcePath:'Demo.md',expectedPaths:paths,lineStart:10,
 }],async()=>{
   for(let i=0;i<12;i+=1){await nextFrame();if(hitInside(section))immediateHitFrames+=1;}

   scroll.scrollTop=650;
   for(let i=0;i<16;i+=1){await nextFrame();if(Math.abs(scroll.scrollTop-650)<=1)preservedScrollFrames+=1;}

   api.prepareImageSectionHostUnload(section);
   const raw=document.createElement('pre');raw.className='host-raw';raw.dataset.hostSurface='raw-code-block';raw.textContent='RAW MARKDOWN HOST';
   section.replaceWith(raw);
   for(let i=0;i<10;i+=1){
     await nextFrame();
     rawFrames+=1;
     const overlay=document.querySelector('[data-image-continuity-overlay="true"]');
     if(overlay){
       const rawRect=raw.getBoundingClientRect();const overlayRect=overlay.getBoundingClientRect();
       if(Math.abs(rawRect.left-overlayRect.left)<=1 && Math.abs(rawRect.top-overlayRect.top)<=1 && Math.abs(rawRect.width-overlayRect.width)<=1) coveredRawFrames+=1;
       if(getComputedStyle(overlay).pointerEvents==='none') overlayPointerTransparentFrames+=1;
     }
   }

   const fresh=sectionMarkup();raw.replaceWith(fresh);section=fresh;
   api.claimImageSectionHostContinuity(fresh,'Demo.md',paths,10);
   await nextFrame();
   for(let i=0;i<6;i+=1){
     if(document.querySelector('[data-image-continuity-overlay="true"]'))freshOverlayFrames+=1;
     if(hitInside(fresh))freshHitFrames+=1;
     await nextFrame();
   }
   return 'saved';
 });
 const result=await operation;
 if(typeof originalStart==='function') document.startViewTransition=originalStart;

 const details={
   controlRawFrames,
   result,
   immediateHitFrames,
   preservedScrollFrames,
   rawFrames,
   coveredRawFrames,
   overlayPointerTransparentFrames,
   freshHitFrames,
   freshOverlayFrames,
   viewTransitionCalls,
 };
 const checks={
   controlReproducesRawHost:controlRawFrames===6,
   updateCompletes:result==='saved',
   imageSectionRemainsInteractiveBeforeUnload:immediateHitFrames===12,
   continuityDoesNotLockScroll:preservedScrollFrames===16,
   rawGapFullyCovered:rawFrames===10 && coveredRawFrames===10,
   overlayNeverCapturesPointer:overlayPointerTransparentFrames===10,
   freshRendererImmediatelyInteractive:freshHitFrames===6,
   staleOverlayDoesNotCoverFreshRenderer:freshOverlayFrames===0,
   documentViewTransitionIsNotUsed:viewTransitionCalls===0,
 };
 document.body.dataset.details=JSON.stringify({...checks,...details});
 document.body.dataset.result=Object.values(checks).every(Boolean)?'pass':'fail';
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail';});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section non-blocking host continuity",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 720 },
    resultTimeoutMs: 15000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "image-section-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";
      export { AddImageSectionModal } from "./src/ui/image-section-modal";
      export { reorderImageSectionPaths } from "./src/domain/image-section-order";
      export { ImageLightboxModal, imageLightboxEntries } from "./src/ui/image-lightbox";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "image-section-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageSections",
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
              this.contentEl = document.createElement("div");
              this.modalEl.appendChild(this.contentEl);
              document.body.appendChild(this.modalEl);
            }
            setTitle(title) { this.title = title; }
            open() { window.__modalOpenCount = (window.__modalOpenCount || 0) + 1; this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice { constructor(message) { window.__notices = [...(window.__notices || []), message]; } }
          export class TFile {}
          export function normalizePath(value) { return String(value || ""); }
          export async function requestUrl() { throw new Error("requestUrl is not available in browser fixture"); }
          export class MenuItem {
            setTitle() { return this; } setIcon() { return this; } setWarning() { return this; }
            onClick(callback) { this.callback = callback; return this; }
          }
          export class Menu {
            addItem(callback) { callback(new MenuItem()); return this; }
            showAtMouseEvent() { return this; }
          }
          export function setIcon(parent) { parent.dataset.icon = "1"; }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "image-section-interactions.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%23666'/%3E%3C/svg%3E";
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;color:#eee;font-family:sans-serif}${styles}
#scroll-shell{height:100%;overflow-y:auto}.top-spacer{height:480px}#section{width:370px;margin:8px}.bottom-spacer{height:900px}.animelist-image-add-modal{position:relative!important;inset:auto!important;margin:8px;background:#181818;padding:8px}
#section .al-image-gallery-viewport:not(.is-expanded){max-height:90px}
</style></head><body data-result="pending"><div id="scroll-shell" class="cm-scroller"><div class="top-spacer"></div><section id="section"></section><div class="bottom-spacer"></div></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
</script><script>${bundle}</script><script>
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
window.__masonryReplaceCalls=0;
const originalReplaceChildren=Element.prototype.replaceChildren;
Element.prototype.replaceChildren=function(...nodes){
 if(this.classList?.contains("al-image-masonry")) window.__masonryReplaceCalls+=1;
 return originalReplaceChildren.apply(this,nodes);
};
const touch=(target,type,x,y,pointerId=7)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==="pointerup"?0:1}));
const mousePointer=(target,type,x,y,pointerId=8)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId,pointerType:"mouse",isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==="pointerup"?0:1}));
const center=(el)=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}};
const paths=["a.jpg","b.jpg","c.jpg","d.jpg","e.jpg","f.jpg"];
let current=[...paths];
let columns=4;
let staleColumnsMetadata=false;
const source=()=>current.map(p=>"- "+p).join("\\n");
const state=()=>({source:source(),lineStart:0,lineEnd:current.length+1});
const service={
 resolve:(path)=>({resourcePath:"${pixel}#"+path}),
 setColumns:async(_note,_loc,value)=>{
  columns=value;
  requestAnimationFrame(()=>{ document.querySelector("#scroll-shell").scrollTop = 24; });
  return state();
 },
 moveAsset:async(_note,_sourceLoc,_targetLoc,moving,target,placement)=>{
  window.__movePersisted=false;
  await delay(90);
  current=AnimeListImageSections.reorderImageSectionPaths(current,moving,target,placement);
  window.__movePersisted=true;
  return{sourceSection:state(),targetSection:state(),markdown:""}
 },
 setAsCover:async()=>{},
 removeMany:async()=>source(),
 addAssets:async()=>({source:source(),duplicatesSkipped:0}),
 fetchRemoteAsset:async()=>{throw new Error("unused")},
};
const context={sourcePath:"Demo.md",getSectionInfo:()=>({lineStart:0,lineEnd:current.length+1,text:String.fromCharCode(96).repeat(3)+"animelist-images"+(columns===4?"":" columns="+columns)+"\\n"+source()+"\\n"+String.fromCharCode(96).repeat(3)})};
const host={app:{}};
const section=document.querySelector("#section");
const renderer=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,source(),context);
renderer.onload();
(async()=>{
 const details={};
 const scrollShell=document.querySelector('#scroll-shell');
 scrollShell.scrollTop=430;
 const slider=section.querySelector('.al-image-column-control input[type="range"]');
 const scrollBeforeColumnPersist=scrollShell.scrollTop;
 slider.value="5"; slider.dispatchEvent(new Event("input",{bubbles:true})); slider.dispatchEvent(new Event("change",{bubbles:true}));
 await delay(260);
 details.mobileFiveColumnsAreExact=section.querySelectorAll('.al-image-masonry-column').length===5 && getComputedStyle(section.querySelector('.al-image-masonry')).gridTemplateColumns.split(' ').filter(Boolean).length===5;
 details.columnPersistKeepsViewportStable=Math.abs(scrollShell.scrollTop-scrollBeforeColumnPersist)<=1;

 // Reducing the column count makes the masonry much taller. Chromium/Obsidian
 // can apply scroll anchoring during that live relayout, so assert the range
 // control itself remains at the same viewport Y instead of only checking a
 // saved scrollTop after persistence.
 const barTopBeforeDecrease=slider.getBoundingClientRect().top;
 requestAnimationFrame(()=>{ scrollShell.scrollTop-=120; });
 slider.value="2"; slider.dispatchEvent(new Event("input",{bubbles:true}));
 await delay(80);
 details.columnDecreaseKeepsBarFixedDuringInput=Math.abs(slider.getBoundingClientRect().top-barTopBeforeDecrease)<=1;
 slider.dispatchEvent(new Event("change",{bubbles:true}));
 await delay(260);
 details.columnDecreaseKeepsBarFixedAfterPersist=Math.abs(slider.getBoundingClientRect().top-barTopBeforeDecrease)<=1;
 const expandButton=section.querySelector('.al-image-expand-button');
 if(expandButton.hidden) throw new Error('fixture must expose expand control');
 expandButton.click();
 await delay(20);
 details.galleryCanExpandBeforeReorder=section.querySelector('.al-image-gallery-viewport').classList.contains('is-expanded');
 const moving=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 const movingImage=moving.querySelector('img');
 const handle=moving.querySelector('.al-image-drag-handle');
 const target=section.querySelector('.al-image-item[data-image-path="c.jpg"]');
 const start=center(handle), end=center(target);
 const movingRectBeforeDrop=moving.getBoundingClientRect();
 touch(handle,"pointerdown",start.x,start.y,21); touch(moving,"pointermove",end.x,end.y+10,21);
 await delay(10);
 details.touchDragUsesGhost=document.querySelectorAll('.al-image-drag-ghost').length===1;
 details.dragSourceDoesNotFade=getComputedStyle(moving).opacity==="1";
 const masonryRelayoutsBeforeDrop=window.__masonryReplaceCalls;
 touch(moving,"pointerup",end.x,end.y+10,21);
 const masonryRelayoutsAfterOptimisticDrop=window.__masonryReplaceCalls;
 const immediateMoved=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 const immediateRect=immediateMoved.getBoundingClientRect();
 details.dragMovesBeforePersistence=window.__movePersisted===false
   && immediateMoved===moving
   && (Math.abs(immediateRect.top-movingRectBeforeDrop.top)>1 || Math.abs(immediateRect.left-movingRectBeforeDrop.left)>1);
 await delay(120);
 details.persistenceDoesNotRelayoutSettledGallery=window.__masonryReplaceCalls===masonryRelayoutsAfterOptimisticDrop
   && masonryRelayoutsAfterOptimisticDrop===masonryRelayoutsBeforeDrop;
 const moved=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 details.touchGalleryReorderPersisted=current.join(",")==="b.jpg,c.jpg,a.jpg,d.jpg,e.jpg,f.jpg";
 details.galleryNodesArePreserved=moved===moving && moved.querySelector('img')===movingImage;
 details.reorderPreservesExpandedState=section.querySelector('.al-image-gallery-viewport').classList.contains('is-expanded');
 details.reorderPreservesPreferredColumns=section.querySelectorAll('.al-image-masonry-column').length===2
   && section.querySelector('.al-image-column-control input[type="range"]').value==='2';
 details.dragGhostCleansUp=document.querySelectorAll('.al-image-drag-ghost').length===0;
 details.touchHandleIsAvailable=parseFloat(getComputedStyle(moved.querySelector('.al-image-drag-handle')).opacity)>0;

 // Obsidian can replace a Markdown render child after the note write completes,
 // before the browser dispatches its post-pointerup click. The drag gesture must
 // still consume that click so a newly-created image item cannot open lightbox.
 const modalCountBeforeDropClick=window.__modalOpenCount||0;
 renderer.onunload();
 section.replaceChildren();
 // Simulate Obsidian recreating the Markdown child before getSectionInfo() has
 // caught up with the just-persisted fence metadata. The renderer must keep the
 // user's presentation state from the internal reorder instead of falling back
 // to the legacy default of four columns.
 staleColumnsMetadata=true;
 const replacement=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,source(),context);
 replacement.onload();
 details.renderChildReplacementPreservesExpandedState=section.querySelector('.al-image-gallery-viewport').classList.contains('is-expanded');
 details.renderChildReplacementPreservesColumns=section.querySelectorAll('.al-image-masonry-column').length===2
   && section.querySelector('.al-image-column-control input[type="range"]').value==='2';
 staleColumnsMetadata=false;
 const replacementTarget=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 replacementTarget.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:end.x,clientY:end.y+10}));
 await delay(20);
 details.dragReleaseDoesNotOpenLightbox=(window.__modalOpenCount||0)===modalCountBeforeDropClick;

 const mouseMoving=section.querySelector('.al-image-item[data-image-path="b.jpg"]');
 const mouseTarget=section.querySelector('.al-image-item[data-image-path="d.jpg"]');
 const mouseStart=center(mouseMoving), mouseEnd=center(mouseTarget);
 mousePointer(mouseMoving,"pointerdown",mouseStart.x,mouseStart.y,41);
 mousePointer(mouseMoving,"pointermove",mouseEnd.x,mouseEnd.y+10,41);
 await delay(10);
 mousePointer(mouseMoving,"pointerup",mouseEnd.x,mouseEnd.y+10,41);
 await delay(20);
 const modalCountBeforeMouseDropClick=window.__modalOpenCount||0;
 replacement.onunload();
 section.replaceChildren();
 const mouseReplacement=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,source(),context);
 mouseReplacement.onload();
 const mouseReplacementTarget=section.querySelector('.al-image-item[data-image-path="b.jpg"]');
 mouseReplacementTarget.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:mouseEnd.x,clientY:mouseEnd.y+10}));
 await delay(20);
 details.mouseDragReleaseDoesNotOpenLightbox=(window.__modalOpenCount||0)===modalCountBeforeMouseDropClick;

 const lightbox=new AnimeListImageSections.ImageLightboxModal(host.app,service,AnimeListImageSections.imageLightboxEntries(context.sourcePath,["a.jpg","b.jpg","c.jpg"]),0);
 lightbox.open();
 await delay(20);
 const lightboxImage=document.querySelector('.al-image-lightbox-image');
 const lightboxStage=document.querySelector('.al-image-lightbox-stage');
 const initialLightboxSrc=lightboxImage.src;
 lightboxStage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-300}));
 await delay(20);
 details.lightboxWheelZooms=/scale\((?!1(?:\.0+)?\))/.test(lightboxImage.style.transform);
 document.querySelector('.al-image-lightbox-nav.is-next').click();
 await delay(20);
 details.lightboxNavigationPreservesImageNode=document.querySelector('.al-image-lightbox-image')===lightboxImage
   && lightboxImage.src!==initialLightboxSrc
   && document.querySelector('.al-image-lightbox-counter').textContent==='2 / 3';
 lightbox.close();

 scrollShell.style.display="none";

 let submitted=[];
 const modal=new AnimeListImageSections.AddImageSectionModal({},service,async assets=>{submitted=assets.map(a=>a.name)});
 modal.queue=[
  {asset:{name:"one.png",contentType:"image/png",data:new Uint8Array([1])},previewUrl:"${pixel}",key:1},
  {asset:{name:"two.png",contentType:"image/png",data:new Uint8Array([2])},previewUrl:"${pixel}",key:2},
  {asset:{name:"three.png",contentType:"image/png",data:new Uint8Array([3])},previewUrl:"${pixel}",key:3},
 ];
 modal.nextKey=4; modal.onOpen(); modal.render();
 const queue=modal.contentEl.querySelector('.al-image-queue');
 const first=queue.querySelector('.al-image-queue-item[data-queue-key="1"]');
 const firstHandle=first.querySelector('.al-image-queue-drag-handle');
 const third=queue.querySelector('.al-image-queue-item[data-queue-key="3"]');
 const qs=center(firstHandle), qe=center(third);
 touch(firstHandle,"pointerdown",qs.x,qs.y,31); touch(first,"pointermove",qe.x+20,qe.y,31); await delay(10);
 details.previewTouchDragUsesGhost=document.querySelectorAll('.al-image-queue-drag-ghost').length===1;
 touch(first,"pointerup",qe.x+20,qe.y,31); await delay(20);
 details.previewDomNodesArePreserved=queue.querySelector('.al-image-queue-item[data-queue-key="1"]')===first;
 details.previewQueueReordered=modal.queue.map(x=>x.asset.name).join(",")==="two.png,three.png,one.png";
 await modal.submit(); await delay(10);
 details.previewSubmitUsesDraggedOrder=submitted.join(",")==="two.png,three.png,one.png";
 details.previewGhostCleansUp=document.querySelectorAll('.al-image-queue-drag-ghost').length===0;
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?"pass":"fail";
})().catch(error=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result="fail"});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Sections exact columns and touch drag interactions",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

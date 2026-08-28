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
      export { ImageSectionOrderSession } from "./src/ui/image-section-order-session";
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
// This fixture isolates the renderer/pointer lifecycle. Host-level Markdown
// replacement continuity is covered separately in check-image-section-host-continuity.mjs.
Object.defineProperty(document,"startViewTransition",{value:undefined,configurable:true});
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
const logicalOrder=(root)=>{
 const columns=[...root.querySelectorAll('.al-image-masonry-column')].map((column)=>[...column.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath));
 const order=[];
 const rows=Math.max(0,...columns.map((column)=>column.length));
 for(let row=0;row<rows;row+=1) for(const column of columns) if(column[row]) order.push(column[row]);
 return order;
};
const paths=["a.jpg","b.jpg","c.jpg","d.jpg","e.jpg","f.jpg"];
let current=[...paths];
let columns=4;
let staleColumnsMetadata=false;
let moveDelay=90;
let moveCalls=0;
let journalWrites=0;
let addCalls=0;
const source=()=>current.map(p=>"- "+p).join("\\n");
const state=()=>({source:source(),lineStart:0,lineEnd:current.length+1});
const service={
 resolve:(path)=>path==="missing.jpg"?{resourcePath:""}:path==="broken.jpg"?{resourcePath:"data:image/png;base64,not-valid"}:{resourcePath:"${pixel}#"+path},
 setColumns:async(_note,_loc,value)=>{
  columns=value;
  requestAnimationFrame(()=>{ document.querySelector("#scroll-shell").scrollTop = 24; });
  return state();
 },
 setSectionOrders:async(_note,replacements)=>{
  window.__movePersisted=false;
  await delay(moveDelay);
  const replacement=replacements[0];
  current=[...replacement.paths];
  moveCalls+=1;
  window.__movePersisted=true;
  return replacements.map((entry)=>({source:entry.paths.map((path)=>"- "+path).join("\\n"),lineStart:0,lineEnd:entry.paths.length+1}));
 },
 setAsCover:async()=>{},
 removeMany:async(_note,_loc,_paths,currentPaths)=>{current=[...(currentPaths||current)];return source()},
 addAssets:async(_note,_loc,_assets,currentPaths)=>{addCalls+=1;current=[...(currentPaths||current)];return{source:source(),duplicatesSkipped:0}},
 fetchRemoteAsset:async()=>{throw new Error("unused")},
};
const journalRecords=new Map();
const journal={
 async loadAll(){return [...journalRecords.values()].map((record)=>structuredClone(record))},
 async write(record){journalWrites+=1;journalRecords.set(record.sourcePath,structuredClone(record))},
 async remove(sourcePath){journalRecords.delete(sourcePath)},
};
const orderSession=new AnimeListImageSections.ImageSectionOrderSession(journal,service);
const context={sourcePath:"Demo.md",getSectionInfo:()=>({lineStart:0,lineEnd:current.length+1,text:String.fromCharCode(96).repeat(3)+"animelist-images"+(columns===4?"":" columns="+columns)+"\\n"+source()+"\\n"+String.fromCharCode(96).repeat(3)})};
const host={app:{}};
const section=document.querySelector("#section");
let renderer=null;
(async()=>{
 await orderSession.initialize();
 renderer=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,orderSession,source(),context);
 renderer.onload();
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
 const galleryImagesBeforeDrag=[...section.querySelectorAll('.al-image-item img')];
 const bodyImageCountBeforeDrag=document.body.querySelectorAll('img').length;
 const modalCountAtDragStart=window.__modalOpenCount||0;
 let transientMediaSurface=false;
 let transientLightbox=false;
 let movingImageSourceMutations=0;
 const movingImageObserver=new MutationObserver((records)=>{
   movingImageSourceMutations+=records.filter((record)=>record.type==='attributes' && (record.attributeName==='src' || record.attributeName==='srcset')).length;
 });
 movingImageObserver.observe(movingImage,{attributes:true,attributeFilter:['src','srcset']});
 const dragSurfaceObserver=new MutationObserver((records)=>{
   for(const record of records){
     for(const node of record.addedNodes){
       if(!(node instanceof Element)) continue;
       if(node.matches('.al-image-drag-ghost,.animelist-image-lightbox') || node.querySelector('.al-image-drag-ghost,.animelist-image-lightbox')) transientMediaSurface=true;
       if(node.matches('.animelist-image-lightbox') || node.querySelector('.animelist-image-lightbox')) transientLightbox=true;
     }
   }
 });
 dragSurfaceObserver.observe(document.body,{childList:true,subtree:true});
 touch(handle,"pointerdown",start.x,start.y,21); touch(moving,"pointermove",end.x,end.y+10,21);
 await delay(10);
 details.touchDragUsesOriginalCardOnly=document.querySelectorAll('.al-image-drag-ghost,.al-pointer-drag-ghost').length===0
   && document.body.querySelectorAll('img').length===bodyImageCountBeforeDrag
   && moving.classList.contains('is-pointer-dragging');
 details.dragSourceDoesNotFade=getComputedStyle(moving).opacity==="1";
 const masonryRelayoutsBeforeDrop=window.__masonryReplaceCalls;
 touch(moving,"pointerup",end.x,end.y+10,21);
 const masonryRelayoutsAfterOptimisticDrop=window.__masonryReplaceCalls;
 const immediateMoved=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 details.dragMovesBeforePersistence=window.__movePersisted!==true
   && immediateMoved===moving
   && (immediateMoved.dataset.layoutMotion==='active' || immediateMoved.getAnimations().length>0);
 details.galleryReorderUsesLayoutMotion=immediateMoved.getAnimations().length>0 || immediateMoved.dataset.layoutMotion==='active';
 let framePipelineStable=true;
 for(let frame=0;frame<24;frame+=1){
   await new Promise((resolve)=>requestAnimationFrame(resolve));
   const liveImages=[...section.querySelectorAll('.al-image-item img')];
   if(document.querySelector('.al-image-drag-ghost,.al-pointer-drag-ghost,.animelist-image-lightbox')) framePipelineStable=false;
   if((window.__modalOpenCount||0)!==modalCountAtDragStart) framePipelineStable=false;
   if(document.body.querySelectorAll('img').length!==bodyImageCountBeforeDrag) framePipelineStable=false;
   if(liveImages.length!==galleryImagesBeforeDrag.length || liveImages.some((image,index)=>image!==galleryImagesBeforeDrag[index] && !galleryImagesBeforeDrag.includes(image))) framePipelineStable=false;
   if(section.querySelector('.al-image-item[data-image-path="a.jpg"]')!==moving || moving.querySelector('img')!==movingImage) framePipelineStable=false;
 }
 dragSurfaceObserver.disconnect();
 movingImageObserver.disconnect();
 details.dragPipelineHasNoTransientMediaSurface=framePipelineStable && !transientMediaSurface && !transientLightbox
   && movingImageSourceMutations===0 && (window.__modalOpenCount||0)===modalCountAtDragStart;
 await delay(30);
 details.persistenceDoesNotRelayoutSettledGallery=window.__masonryReplaceCalls===masonryRelayoutsAfterOptimisticDrop
   && masonryRelayoutsAfterOptimisticDrop===masonryRelayoutsBeforeDrop;
 const moved=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 details.touchGalleryReorderOptimistic=logicalOrder(section).join(",")==="b.jpg,c.jpg,a.jpg,d.jpg,e.jpg,f.jpg";
 details.galleryNodesArePreserved=moved===moving && moved.querySelector('img')===movingImage;
 details.reorderPreservesExpandedState=section.querySelector('.al-image-gallery-viewport').classList.contains('is-expanded');
 details.reorderPreservesPreferredColumns=section.querySelectorAll('.al-image-masonry-column').length===2
   && section.querySelector('.al-image-column-control input[type="range"]').value==='2';
 details.dragLeavesNoFloatingPreview=document.querySelectorAll('.al-image-drag-ghost,.al-pointer-drag-ghost').length===0;
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
 const replacement=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,orderSession,source(),context);
 replacement.onload();
 details.renderChildReplacementPreservesExpandedState=section.querySelector('.al-image-gallery-viewport').classList.contains('is-expanded');
 details.renderChildReplacementPreservesColumns=section.querySelectorAll('.al-image-masonry-column').length===2
   && section.querySelector('.al-image-column-control input[type="range"]').value==='2';
 staleColumnsMetadata=false;
 const replacementTarget=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 replacementTarget.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:end.x,clientY:end.y+10}));
 await delay(20);
 details.dragReleaseDoesNotOpenLightbox=(window.__modalOpenCount||0)===modalCountBeforeDropClick;
 await delay(20);
 details.touchGalleryReorderPersisted=moveCalls===0 && journalWrites>=1
   && logicalOrder(section).join(",")==="b.jpg,c.jpg,a.jpg,d.jpg,e.jpg,f.jpg";

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
 const mouseReplacement=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,orderSession,source(),context);
 mouseReplacement.onload();
 const mouseReplacementTarget=section.querySelector('.al-image-item[data-image-path="b.jpg"]');
 mouseReplacementTarget.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,clientX:mouseEnd.x,clientY:mouseEnd.y+10}));
 await delay(20);
 details.mouseDragReleaseDoesNotOpenLightbox=(window.__modalOpenCount||0)===modalCountBeforeMouseDropClick;
 const replacementCardBeforeStaleCompletion=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 const replacementImageBeforeStaleCompletion=replacementCardBeforeStaleCompletion?.querySelector('img');
 await delay(330);
 details.unloadedRendererCannotRepaintReplacement=section.querySelector('.al-image-item[data-image-path="a.jpg"]')===replacementCardBeforeStaleCompletion
   && replacementCardBeforeStaleCompletion?.querySelector('img')===replacementImageBeforeStaleCompletion;
 await delay(20);
 const stressRenderer=new AnimeListImageSections.ImageSectionRenderChild(section,host,service,orderSession,source(),context);
 stressRenderer.onload();
 const stressCardAfterOwnershipTransfer=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
 const stressImageAfterOwnershipTransfer=stressCardAfterOwnershipTransfer?.querySelector('img');
 mouseReplacement.onunload();
 details.newRendererSurvivesOldUnload=section.querySelector('.al-image-item[data-image-path="a.jpg"]')===stressCardAfterOwnershipTransfer
   && stressCardAfterOwnershipTransfer?.querySelector('img')===stressImageAfterOwnershipTransfer;

 // Stress the complete reorder gesture without media clones. Reduced motion is
 // used only for this 100-cycle lifecycle test so it measures pointer/drop/DOM
 // correctness instead of spending ~19 seconds waiting for FLIP animations.
 const originalMatchMedia=window.matchMedia;
 window.matchMedia=()=>({matches:true,media:'(prefers-reduced-motion: reduce)',addEventListener(){},removeEventListener(){}});
 moveDelay=0;
 const stressModalCount=window.__modalOpenCount||0;
 const stressImages=new Map([...section.querySelectorAll('.al-image-item')].map((item)=>[item.dataset.imagePath,item.querySelector('img')]));
 const stressCallsBefore=moveCalls;
 const stressJournalWritesBefore=journalWrites;
 let stressStable=true;
 for(let iteration=0;iteration<100;iteration+=1){
   const liveMoving=section.querySelector('.al-image-item[data-image-path="a.jpg"]');
   const liveOrder=logicalOrder(section);
   const otherPaths=liveOrder.filter((path)=>path!=="a.jpg");
   const moveToEnd=iteration%2===0;
   const targetPath=moveToEnd?otherPaths[otherPaths.length-1]:otherPaths[0];
   const liveTarget=section.querySelector('.al-image-item[data-image-path="'+targetPath+'"]');
   const liveHandle=liveMoving?.querySelector('.al-image-drag-handle');
   if(!liveMoving||!liveTarget||!liveHandle){stressStable=false;break;}
   const from=center(liveHandle), targetRect=liveTarget.getBoundingClientRect();
   const to={x:targetRect.left+targetRect.width/2,y:moveToEnd?targetRect.top+targetRect.height*0.75:targetRect.top+targetRect.height*0.25};
   touch(liveHandle,'pointerdown',from.x,from.y,1000+iteration);
   touch(liveMoving,'pointermove',to.x,to.y,1000+iteration);
   touch(liveMoving,'pointerup',to.x,to.y,1000+iteration);
   if(moveCalls!==stressCallsBefore) stressStable=false;
   if(document.querySelector('.al-image-drag-ghost,.al-pointer-drag-ghost,.animelist-image-lightbox')) stressStable=false;
   if((window.__modalOpenCount||0)!==stressModalCount) stressStable=false;
   for(const [path,image] of stressImages){
     if(section.querySelector('.al-image-item[data-image-path="'+path+'"] img')!==image) stressStable=false;
   }
 }
 const stressFinalOrder=logicalOrder(section).join(',');
 await delay(40);
 window.matchMedia=originalMatchMedia;
 moveDelay=90;
 details.hundredReordersKeepSingleMediaSurface=stressStable;
 details.hundredReordersCoalescePersistence=moveCalls===stressCallsBefore
   && journalWrites===stressJournalWritesBefore+1
   && logicalOrder(section).join(',')===stressFinalOrder;

 const addCallsBeforeRootDrop=addCalls;
 const rootDrop=new Event('drop',{bubbles:true,cancelable:true});
 Object.defineProperty(rootDrop,'dataTransfer',{value:{files:[new File([new Uint8Array([1,2,3])],'late.png',{type:'image/png'})]}});
 section.dispatchEvent(rootDrop);
 await delay(40);
 details.replacedRenderersDoNotDuplicateRootDropHandlers=addCalls===addCallsBeforeRootDrop+1;

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
 details.lightboxValidDoesNotLeakMissingText=getComputedStyle(document.querySelector('.al-image-lightbox-missing')).display==='none';
 lightbox.close();

 const resilienceBox=new AnimeListImageSections.ImageLightboxModal(host.app,service,AnimeListImageSections.imageLightboxEntries(context.sourcePath,["a.jpg","missing.jpg","broken.jpg","c.jpg"]),0);
 resilienceBox.open();
 await delay(40);
 const resilientImage=document.querySelector('.al-image-lightbox-image');
 const resilientMissing=document.querySelector('.al-image-lightbox-missing');
 document.querySelector('.al-image-lightbox-nav.is-next').click();
 await delay(30);
 details.lightboxMissingUsesExclusiveFallback=resilientImage.hidden===true && getComputedStyle(resilientMissing).display!=='none' && resilientMissing.textContent.includes('找不到圖片');
 document.querySelector('.al-image-lightbox-nav.is-next').click();
 await delay(80);
 details.lightboxDecodeFailureUsesExclusiveFallback=resilientImage.hidden===true && getComputedStyle(resilientMissing).display!=='none';
 document.querySelector('.al-image-lightbox-nav.is-next').click();
 await delay(60);
 details.lightboxRecoversAfterFailure=document.querySelector('.al-image-lightbox-image')===resilientImage && resilientImage.hidden===false && getComputedStyle(resilientMissing).display==='none' && document.querySelector('.al-image-lightbox-counter').textContent==='4 / 4';
 document.querySelector('.al-image-lightbox-nav.is-previous').click();
 document.querySelector('.al-image-lightbox-nav.is-next').click();
 await delay(60);
 details.lightboxRapidNavigationIgnoresStaleFailure=resilientImage.hidden===false && getComputedStyle(resilientMissing).display==='none' && document.querySelector('.al-image-lightbox-counter').textContent==='4 / 4';
 resilienceBox.close();

 const brokenSection=document.createElement('section'); document.body.appendChild(brokenSection);
 const brokenRenderer=new AnimeListImageSections.ImageSectionRenderChild(brokenSection,host,service,orderSession,'- broken.jpg', {sourcePath:context.sourcePath,getSectionInfo:()=>({lineStart:0,lineEnd:2,text:'broken'})});
 brokenRenderer.onload();
 await delay(80);
 details.imageSectionDecodeFailureFallsBack=brokenSection.querySelector('.al-image-missing')!==null && brokenSection.querySelector('.al-image-item img')===null;
 brokenRenderer.onunload(); brokenSection.remove();

 scrollShell.style.display="none";

 let submitted=[];
 const modal=new AnimeListImageSections.AddImageSectionModal({},service,async assets=>{submitted=assets.map(a=>a.name)});
 modal.queue=[
  {asset:{name:"one.png",contentType:"image/png",data:new Uint8Array([1])},previewUrl:"data:image/png;base64,not-valid",key:1},
  {asset:{name:"two.png",contentType:"image/png",data:new Uint8Array([2])},previewUrl:"${pixel}",key:2},
  {asset:{name:"three.png",contentType:"image/png",data:new Uint8Array([3])},previewUrl:"${pixel}",key:3},
 ];
 modal.nextKey=4; modal.onOpen(); modal.render();
 await delay(80);
 const queue=modal.contentEl.querySelector('.al-image-queue');
 details.imageQueueDecodeFailureFallsBack=queue.querySelector('[data-queue-key="1"] .al-image-queue-preview-missing')!==null;
 const second=queue.querySelector('.al-image-queue-item[data-queue-key="2"]');
 const secondImage=second.querySelector('img');
 const secondHandle=second.querySelector('.al-image-queue-drag-handle');
 const third=queue.querySelector('.al-image-queue-item[data-queue-key="3"]');
 const qs=center(secondHandle), qe=center(third);
 const queueImageCountBeforeDrag=document.body.querySelectorAll('img').length;
 touch(secondHandle,"pointerdown",qs.x,qs.y,31); touch(second,"pointermove",qe.x+20,qe.y,31); await delay(10);
 details.previewTouchDragUsesOriginalCardOnly=document.querySelectorAll('.al-image-queue-drag-ghost,.al-pointer-drag-ghost').length===0
   && document.body.querySelectorAll('img').length===queueImageCountBeforeDrag
   && second.classList.contains('is-pointer-dragging');
 touch(second,"pointerup",qe.x+20,qe.y,31); await delay(20);
 details.previewDomNodesArePreserved=queue.querySelector('.al-image-queue-item[data-queue-key="2"]')===second && second.querySelector('img')===secondImage;
 details.previewQueueReordered=modal.queue.map(x=>x.asset.name).join(",")==="one.png,three.png,two.png";
 await modal.submit(); await delay(10);
 details.previewSubmitUsesDraggedOrder=submitted.join(",")==="one.png,three.png,two.png";
 details.previewLeavesNoFloatingPreview=document.querySelectorAll('.al-image-queue-drag-ghost,.al-pointer-drag-ghost').length===0;

 let lateRemoteResolved=false;
 const raceService={...service,fetchRemoteAsset:async()=>{await delay(50);lateRemoteResolved=true;return{name:'late.png',contentType:'image/png',data:new Uint8Array([4,5,6])}}};
 const raceModal=new AnimeListImageSections.AddImageSectionModal({},raceService,async()=>{});
 raceModal.open();
 const raceInput=raceModal.contentEl.querySelector('.al-image-url-group input');
 raceInput.value='https://example.invalid/late.png';
 raceInput.dispatchEvent(new Event('input',{bubbles:true}));
 raceModal.contentEl.querySelector('.al-image-url-row button').click();
 await delay(5);
 raceModal.close();
 await delay(80);
 details.closedAddModalIgnoresLateRemoteImage=lateRemoteResolved && raceModal.contentEl.childElementCount===0 && !raceModal.modalEl.isConnected;

 const cancelModal=new AnimeListImageSections.AddImageSectionModal({},service,async()=>{});
 cancelModal.queue=[
  {asset:{name:'x.png',contentType:'image/png',data:new Uint8Array([1])},previewUrl:"${pixel}",key:51},
  {asset:{name:'y.png',contentType:'image/png',data:new Uint8Array([2])},previewUrl:"${pixel}",key:52},
 ];
 cancelModal.nextKey=53; cancelModal.open();
 const cancelQueue=cancelModal.contentEl.querySelector('.al-image-queue');
 const cancelMoving=cancelQueue.querySelector('[data-queue-key="51"]');
 const cancelHandle=cancelMoving.querySelector('.al-image-queue-drag-handle');
 const cancelTarget=cancelQueue.querySelector('[data-queue-key="52"]');
 const cancelFrom=center(cancelHandle),cancelTo=center(cancelTarget);
 touch(cancelHandle,'pointerdown',cancelFrom.x,cancelFrom.y,77);
 touch(cancelMoving,'pointermove',cancelTo.x+10,cancelTo.y,77);
 await delay(5);
 const cancelDragStarted=cancelMoving.classList.contains('is-pointer-dragging');
 cancelModal.close();
 touch(cancelMoving,'pointerup',cancelTo.x+10,cancelTo.y,77);
 await delay(10);
 details.closingAddModalCancelsActivePointerDrag=cancelDragStarted && !cancelMoving.classList.contains('is-pointer-dragging')
   && !document.querySelector('.al-image-queue-drag-ghost,.al-pointer-drag-ghost');

 stressRenderer.onunload();
 orderSession.dispose();
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
    resultTimeoutMs: 30000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

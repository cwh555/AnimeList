import { mkdir, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-drag-hot-path";
const profile = `${output}/profile`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: `export { beginImageSectionPointerDrag, registerImageSectionDragSurface } from "./src/ui/image-section-drag-controller";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${output}/bundle.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageDragHotPath",
  target: "es2022",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `export function setIcon() {}
          export function normalizePath(value) { return String(value || ""); }`,
      }));
    },
  }],
});

const bundle = await import("node:fs/promises").then(({ readFile }) => readFile(`${output}/bundle.js`, "utf8"));
const html = `<!doctype html><html><head><style>
  :root{--interactive-accent:#8b7cf6;--background-secondary:#222;--font-ui-small:13px}
  html,body{margin:0;width:100%;height:100%;background:#111}
  #section{width:440px;margin:40px;padding:12px}
  .al-image-gallery-viewport{display:flex;gap:12px}
  .al-image-item{width:120px;height:100px;background:#555;box-sizing:border-box}
  .is-image-drag-target{outline:2px solid #fff}
</style></head><body data-result="pending">
<section id="section" class="animelist-image-section"><div class="al-image-gallery-viewport">
  <div id="a" class="al-image-item" data-image-path="a.jpg"></div>
  <div id="b" class="al-image-item" data-image-path="b.jpg"></div>
  <div id="c" class="al-image-item" data-image-path="c.jpg"></div>
</div></section>
<script>
  window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
    addClass:function(...names){this.classList.add(...names)},
    removeClass:function(...names){this.classList.remove(...names)},
    toggleClass:function(name,force){this.classList.toggle(name,force)},
  })) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true});
</script><script>${bundle}</script><script>
(async()=>{
  const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  const section=document.querySelector('#section');
  const a=document.querySelector('#a');
  const b=document.querySelector('#b');
  const c=document.querySelector('#c');
  const gallery=section.querySelector('.al-image-gallery-viewport');
  const lifecycle=new AbortController();
  let participantPaths=['a.jpg','b.jpg','c.jpg'];
  const participant={
    sourcePath:'HotPath.md',
    paths:()=>participantPaths,
    applyPaths:(paths)=>{
      participantPaths=[...paths];
      const nodes=new Map([['a.jpg',a],['b.jpg',b],['c.jpg',c]]);
      gallery.replaceChildren(...participantPaths.map((path)=>nodes.get(path)));
    },
  };
  let dropCount=0;
  let droppedTarget='';
  let droppedPlacement='';
  const dragStates=[];
  const surface={
    containerEl:section,
    participant,
    signal:lifecycle.signal,
    canStart:()=>true,
    closeMenus:()=>{},
    setDragging:(active)=>dragStates.push(active),
    drop:(source,_path,targetPath,placement)=>{
      if(source!==participant) throw new Error('drag source participant changed');
      dropCount+=1;
      droppedTarget=targetPath||'';
      droppedPlacement=placement;
    },
  };
  AnimeListImageDragHotPath.registerImageSectionDragSurface(surface);

  let documentQuerySelectorAllCalls=0;
  const originalDocumentQuerySelectorAll=Document.prototype.querySelectorAll;
  Document.prototype.querySelectorAll=function(...args){
    documentQuerySelectorAllCalls+=1;
    return originalDocumentQuerySelectorAll.apply(this,args);
  };

  const aRect=a.getBoundingClientRect();
  const bRect=b.getBoundingClientRect();
  const start={x:bRect.left+bRect.width/2,y:bRect.top+bRect.height/2};
  const end={x:aRect.left+aRect.width/2,y:aRect.top+aRect.height*0.75};
  const pointerId=71;
  const pointer=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId,pointerType:'touch',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });

  // First verify that a cancelled live preview returns the exact original order.
  AnimeListImageDragHotPath.beginImageSectionPointerDrag(surface,b,'b.jpg',pointer('pointerdown',start.x,start.y,1));
  window.dispatchEvent(pointer('pointermove',end.x,end.y,1));
  await delay(20);
  const cancelPreviewOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);
  window.dispatchEvent(pointer('pointercancel',end.x,end.y,0));
  await delay(20);
  const cancelRestoredOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);

  // Then run the hot repeated-move path from a clean preview state and drop.
  const pointerId2=72;
  const pointer2=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId:pointerId2,pointerType:'touch',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });
  AnimeListImageDragHotPath.beginImageSectionPointerDrag(surface,b,'b.jpg',pointer2('pointerdown',start.x,start.y,1));
  window.dispatchEvent(pointer2('pointermove',end.x,end.y,1));
  await delay(10);
  // Simulate the live masonry putting an unrelated card under the stationary
  // pointer after the preview reflow. Targeting must stay anchored to the
  // drag-start geometry instead of chasing the moving DOM.
  const originalElementFromPoint=document.elementFromPoint.bind(document);
  document.elementFromPoint=()=>c;
  for(let index=0;index<60;index+=1){
    window.dispatchEvent(pointer2('pointermove',end.x,end.y,1));
  }
  document.elementFromPoint=originalElementFromPoint;
  await delay(20);

  const previewOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);
  const previewARect=a.getBoundingClientRect();
  const previewBRect=b.getBoundingClientRect();
  const details={
    repeatedMovesAvoidDocumentWideIndicatorScans:documentQuerySelectorAllCalls===0,
    previewKeepsRealCardCount:gallery.querySelectorAll('.al-image-item[data-image-path]').length===3
      && !document.querySelector('.al-image-drop-placeholder'),
    targetMarked:section.classList.contains('is-image-drag-target') && a.classList.contains('is-selected'),
    previewUsesFinalOrder:JSON.stringify(previewOrder)===JSON.stringify(['b.jpg','a.jpg','c.jpg']),
    movingOccupiesTargetSlot:Math.abs(previewBRect.left-aRect.left)<1,
    targetShiftsForward:previewARect.left>aRect.left,
    stationaryPointerIgnoresReflowedCard:!c.classList.contains('is-selected') && a.classList.contains('is-selected'),
    cancelRestoresOriginalLayout:JSON.stringify(cancelPreviewOrder)===JSON.stringify(['b.jpg','a.jpg','c.jpg'])
      && JSON.stringify(cancelRestoredOrder)===JSON.stringify(['a.jpg','b.jpg','c.jpg']),
  };

  window.dispatchEvent(pointer2('pointerup',end.x,end.y,0));
  await delay(20);
  Object.assign(details,{
    dropDeliveredOnce:dropCount===1 && droppedTarget==='a.jpg' && droppedPlacement==='before',
    cleanupRemovesPreview:!section.classList.contains('is-image-drag-target')
      && !document.querySelector('.al-image-drop-placeholder') && !a.classList.contains('is-selected'),
    dragLifecycleCloses:dragStates.length>=4 && dragStates[0]===true && dragStates.at(-1)===false,
  });
  document.body.dataset.details=JSON.stringify({
    ...details,
    documentQuerySelectorAllCalls,
    dropCount,
    droppedTarget,
    droppedPlacement,
    dragStates,
  });
  document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
  lifecycle.abort();
})().catch((error)=>{
  document.body.dataset.details=String(error?.stack||error);
  document.body.dataset.result='fail';
});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section drag hot path",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 640 },
    resultTimeoutMs: 15000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

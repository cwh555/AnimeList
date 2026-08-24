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
});

const bundle = await import("node:fs/promises").then(({ readFile }) => readFile(`${output}/bundle.js`, "utf8"));
const html = `<!doctype html><html><head><style>
  html,body{margin:0;width:100%;height:100%;background:#111}
  #section{width:300px;margin:40px;padding:12px}
  .al-image-gallery-viewport{display:flex;gap:12px}
  .al-image-item{width:120px;height:100px;background:#555}
  .is-image-drag-target{outline:2px solid #fff}
  .is-drop-before,.is-drop-after{box-shadow:inset 0 -4px #fff}
</style></head><body data-result="pending">
<section id="section" class="animelist-image-section"><div class="al-image-gallery-viewport">
  <div id="a" class="al-image-item" data-image-path="a.jpg"></div>
  <div id="b" class="al-image-item" data-image-path="b.jpg"></div>
</div></section>
<script>
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
  const lifecycle=new AbortController();
  const participant={};
  let dropCount=0;
  let droppedTarget='';
  let droppedPlacement='';
  const surface={
    containerEl:section,
    participant,
    signal:lifecycle.signal,
    canStart:()=>true,
    closeMenus:()=>{},
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
  let indicatorWrites=0;
  const originalAddClass=HTMLElement.prototype.addClass;
  const originalRemoveClass=HTMLElement.prototype.removeClass;
  const isIndicator=(names)=>names.some((name)=>name==='is-image-drag-target'||name==='is-drop-before'||name==='is-drop-after');
  HTMLElement.prototype.addClass=function(...names){
    if(isIndicator(names)) indicatorWrites+=1;
    return originalAddClass.apply(this,names);
  };
  HTMLElement.prototype.removeClass=function(...names){
    if(isIndicator(names)) indicatorWrites+=1;
    return originalRemoveClass.apply(this,names);
  };

  const aRect=a.getBoundingClientRect();
  const bRect=b.getBoundingClientRect();
  const start={x:aRect.left+aRect.width/2,y:aRect.top+aRect.height/2};
  const end={x:bRect.left+bRect.width/2,y:bRect.top+bRect.height*0.75};
  const pointerId=71;
  const pointer=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId,pointerType:'touch',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });

  AnimeListImageDragHotPath.beginImageSectionPointerDrag(surface,a,'a.jpg',pointer('pointerdown',start.x,start.y,1));
  for(let index=0;index<60;index+=1){
    window.dispatchEvent(pointer('pointermove',end.x,end.y,1));
  }
  await delay(20);

  const queryCallsDuringMoves=documentQuerySelectorAllCalls;
  const indicatorWritesDuringMoves=indicatorWrites;
  const targetMarked=section.classList.contains('is-image-drag-target') && b.classList.contains('is-drop-after');

  window.dispatchEvent(pointer('pointerup',end.x,end.y,0));
  await delay(20);
  const details={
    repeatedMovesAvoidDocumentWideIndicatorScans:queryCallsDuringMoves===0,
    repeatedMovesAvoidRedundantIndicatorWrites:indicatorWritesDuringMoves===2,
    targetMarked,
    dropDeliveredOnce:dropCount===1 && droppedTarget==='b.jpg' && droppedPlacement==='after',
    cleanupRemovesIndicators:!section.classList.contains('is-image-drag-target')
      && !b.classList.contains('is-drop-before') && !b.classList.contains('is-drop-after'),
  };
  document.body.dataset.details=JSON.stringify({
    ...details,
    queryCallsDuringMoves,
    indicatorWritesDuringMoves,
    dropCount,
    droppedTarget,
    droppedPlacement,
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

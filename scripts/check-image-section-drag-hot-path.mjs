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
  #boundary-section{position:relative;width:500px;height:150px;margin:40px;padding:12px}
  #boundary-gallery{position:relative;width:460px;height:120px}
  #boundary-gallery .al-image-item{position:absolute}
  #boundary-a{left:0;top:0}
  #boundary-c{left:128px;top:0}
  #boundary-source{left:320px;top:0}
</style></head><body data-result="pending">
<section id="section" class="animelist-image-section"><div class="al-image-gallery-viewport">
  <div id="a" class="al-image-item" data-image-path="a.jpg"></div>
  <div id="b" class="al-image-item" data-image-path="b.jpg"></div>
  <div id="c" class="al-image-item" data-image-path="c.jpg"></div>
</div></section>
<section id="boundary-section" class="animelist-image-section"><div id="boundary-gallery" class="al-image-gallery-viewport">
  <div id="boundary-a" class="al-image-item" data-image-path="boundary-a.jpg"></div>
  <div id="boundary-c" class="al-image-item" data-image-path="boundary-c.jpg"></div>
  <div id="boundary-source" class="al-image-item" data-image-path="boundary-source.jpg"></div>
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

  const boundarySection=document.querySelector('#boundary-section');
  const boundaryGallery=document.querySelector('#boundary-gallery');
  const boundaryA=document.querySelector('#boundary-a');
  const boundaryC=document.querySelector('#boundary-c');
  const boundarySource=document.querySelector('#boundary-source');
  let boundaryPaths=['boundary-a.jpg','boundary-c.jpg','boundary-source.jpg'];
  const boundaryNodes=new Map([
    ['boundary-a.jpg',boundaryA],
    ['boundary-c.jpg',boundaryC],
    ['boundary-source.jpg',boundarySource],
  ]);
  const boundaryParticipant={
    sourcePath:'Boundary.md',
    paths:()=>boundaryPaths,
    applyPaths:(paths)=>{
      boundaryPaths=[...paths];
      boundaryGallery.replaceChildren(...boundaryPaths.map((path)=>boundaryNodes.get(path)));
    },
  };
  let boundaryDropCount=0;
  const boundarySurface={
    containerEl:boundarySection,
    participant:boundaryParticipant,
    signal:lifecycle.signal,
    canStart:()=>true,
    closeMenus:()=>{},
    setDragging:()=>{},
    drop:()=>{ boundaryDropCount+=1; },
  };
  AnimeListImageDragHotPath.registerImageSectionDragSurface(boundarySurface);

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

  AnimeListImageDragHotPath.beginImageSectionPointerDrag(surface,b,'b.jpg',pointer('pointerdown',start.x,start.y,1));
  window.dispatchEvent(pointer('pointermove',end.x,end.y,1));
  const touchFollowRect=b.getBoundingClientRect();
  const touchSourceFollowsPointer=
    Math.abs(touchFollowRect.left+touchFollowRect.width/2-end.x)<1
    && Math.abs(touchFollowRect.top+touchFollowRect.height/2-end.y)<1;
  await delay(20);
  const cancelPreviewOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);
  window.dispatchEvent(pointer('pointercancel',end.x,end.y,0));
  await delay(20);
  const cancelRestoredOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);

  const pointerId2=72;
  const pointer2=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId:pointerId2,pointerType:'touch',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });
  const mousePointer2=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId:pointerId2,pointerType:'mouse',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });
  AnimeListImageDragHotPath.beginImageSectionPointerDrag(surface,b,'b.jpg',mousePointer2('pointerdown',start.x,start.y,1));
  window.dispatchEvent(mousePointer2('pointermove',end.x,end.y,1));
  const follow={x:end.x+18,y:end.y-8};
  window.dispatchEvent(mousePointer2('pointermove',follow.x,follow.y,1));
  const mouseFollowRect=b.getBoundingClientRect();
  const mouseSourceFollowsPointerWithoutFrameDelay=
    Math.abs(mouseFollowRect.left+mouseFollowRect.width/2-follow.x)<1
    && Math.abs(mouseFollowRect.top+mouseFollowRect.height/2-follow.y)<1;
  await delay(10);
  const originalElementsFromPoint=document.elementsFromPoint.bind(document);
  document.elementsFromPoint=()=>[c,section,document.body,document.documentElement];
  for(let index=0;index<60;index+=1){
    window.dispatchEvent(mousePointer2('pointermove',follow.x,follow.y,1));
  }
  document.elementsFromPoint=originalElementsFromPoint;
  await delay(20);

  const previewOrder=[...gallery.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>item.dataset.imagePath);
  const previewARect=a.getBoundingClientRect();
  const previewBRect=b.getBoundingClientRect();
  const [previewTranslateX=0,previewTranslateY=0]=b.style.getPropertyValue('translate')
    .split(/\s+/).filter(Boolean).map((value)=>Number.parseFloat(value)||0);
  const details={
    repeatedMovesAvoidDocumentWideIndicatorScans:documentQuerySelectorAllCalls===0,
    previewKeepsRealCardCount:gallery.querySelectorAll('.al-image-item[data-image-path]').length===3
      && !document.querySelector('.al-image-drop-placeholder'),
    targetMarked:section.classList.contains('is-image-drag-target') && a.classList.contains('is-selected'),
    previewUsesFinalOrder:JSON.stringify(previewOrder)===JSON.stringify(['b.jpg','a.jpg','c.jpg']),
    movingOccupiesTargetSlot:Math.abs((previewBRect.left-previewTranslateX)-aRect.left)<1
      && Math.abs((previewBRect.top-previewTranslateY)-aRect.top)<1,
    targetShiftsForward:previewARect.left>aRect.left,
    stationaryPointerIgnoresReflowedCard:!c.classList.contains('is-selected') && a.classList.contains('is-selected'),
    cancelRestoresOriginalLayout:JSON.stringify(cancelPreviewOrder)===JSON.stringify(['b.jpg','a.jpg','c.jpg'])
      && JSON.stringify(cancelRestoredOrder)===JSON.stringify(['a.jpg','b.jpg','c.jpg']),
    touchSourceFollowsPointer,
    mouseSourceFollowsPointerWithoutFrameDelay,
    followUsesOriginalCardOnly:!document.querySelector('.al-image-drag-overlay')
      && gallery.querySelectorAll('.al-image-item[data-image-path]').length===3,
  };

  window.dispatchEvent(mousePointer2('pointerup',follow.x,follow.y,0));
  await delay(20);

  const boundaryPointerId=73;
  const boundaryPointer=(type,x,y,buttons)=>new PointerEvent(type,{
    bubbles:true,cancelable:true,pointerId:boundaryPointerId,pointerType:'mouse',isPrimary:true,
    clientX:x,clientY:y,button:0,buttons,
  });
  const boundarySourceRect=boundarySource.getBoundingClientRect();
  const boundaryARect=boundaryA.getBoundingClientRect();
  const boundaryCRect=boundaryC.getBoundingClientRect();
  const boundaryStart={x:boundarySourceRect.left+boundarySourceRect.width/2,y:boundarySourceRect.top+boundarySourceRect.height/2};
  const boundaryACenter={x:boundaryARect.left+boundaryARect.width/2,y:boundaryARect.top+boundaryARect.height/2};
  AnimeListImageDragHotPath.beginImageSectionPointerDrag(
    boundarySurface,boundarySource,'boundary-source.jpg',
    boundaryPointer('pointerdown',boundaryStart.x,boundaryStart.y,1),
  );
  window.dispatchEvent(boundaryPointer('pointermove',boundaryACenter.x,boundaryACenter.y,1));

  const selectedBoundaryTarget=()=>boundaryA.classList.contains('is-selected')?'a':(boundaryC.classList.contains('is-selected')?'c':'none');
  const cardBoundaryTargets=[];
  for(let index=0;index<30;index+=1){
    const x=index%2===0?boundaryCRect.left+2:boundaryARect.right-2;
    window.dispatchEvent(boundaryPointer('pointermove',x,boundaryACenter.y,1));
    cardBoundaryTargets.push(selectedBoundaryTarget());
  }
  const cardBoundaryStable=cardBoundaryTargets.every((target)=>target==='a');

  window.dispatchEvent(boundaryPointer('pointermove',boundaryCRect.left+30,boundaryACenter.y,1));
  const deepCrossingSwitchesTarget=selectedBoundaryTarget()==='c';
  const reverseBoundaryTargets=[];
  for(let index=0;index<30;index+=1){
    const x=index%2===0?boundaryARect.right-2:boundaryCRect.left+2;
    window.dispatchEvent(boundaryPointer('pointermove',x,boundaryACenter.y,1));
    reverseBoundaryTargets.push(selectedBoundaryTarget());
  }
  const reverseBoundaryStable=reverseBoundaryTargets.every((target)=>target==='c');
  window.dispatchEvent(boundaryPointer('pointermove',boundaryARect.right-30,boundaryACenter.y,1));
  const deepReturnSwitchesBack=selectedBoundaryTarget()==='a';

  const boundarySectionRect=boundarySection.getBoundingClientRect();
  const outerBoundaryTargets=[];
  for(let index=0;index<20;index+=1){
    const x=index%2===0?boundarySectionRect.left-2:boundarySectionRect.left+2;
    window.dispatchEvent(boundaryPointer('pointermove',x,boundaryACenter.y,1));
    outerBoundaryTargets.push(selectedBoundaryTarget());
  }
  const outerBoundaryStable=outerBoundaryTargets.every((target)=>target==='a');

  const appendBoundaryTargets=[];
  for(let index=0;index<20;index+=1){
    const y=index%2===0?boundaryARect.bottom+2:boundaryARect.bottom-2;
    window.dispatchEvent(boundaryPointer('pointermove',boundaryACenter.x,y,1));
    appendBoundaryTargets.push(selectedBoundaryTarget());
  }
  const appendBoundaryStable=appendBoundaryTargets.every((target)=>target==='a');
  window.dispatchEvent(boundaryPointer('pointermove',boundaryACenter.x,boundaryARect.bottom+30,1));
  const deepAppendActivates=!boundaryA.classList.contains('is-selected') && !boundaryC.classList.contains('is-selected');
  const appendReturnTargets=[];
  for(let index=0;index<20;index+=1){
    const y=index%2===0?boundaryARect.bottom-2:boundaryARect.bottom+2;
    window.dispatchEvent(boundaryPointer('pointermove',boundaryACenter.x,y,1));
    appendReturnTargets.push(selectedBoundaryTarget());
  }
  const appendReturnBoundaryStable=appendReturnTargets.every((target)=>target==='none');
  window.dispatchEvent(boundaryPointer('pointermove',boundaryACenter.x,boundaryARect.top+50,1));
  const deepAppendReturnReacquires=selectedBoundaryTarget()==='a';
  window.dispatchEvent(boundaryPointer('pointerup',boundaryACenter.x,boundaryARect.top+50,0));
  await delay(20);

  Object.assign(details,{
    cardBoundaryStable,
    deepCrossingSwitchesTarget,
    reverseBoundaryStable,
    deepReturnSwitchesBack,
    outerBoundaryStable,
    appendBoundaryStable,
    deepAppendActivates,
    appendReturnBoundaryStable,
    deepAppendReturnReacquires,
    boundaryDropDeliveredOnce:boundaryDropCount===1,
    dropDeliveredOnce:dropCount===1 && droppedTarget==='a.jpg' && droppedPlacement==='before',
    cleanupRemovesPreview:!section.classList.contains('is-image-drag-target')
      && !document.querySelector('.al-image-drop-placeholder') && !a.classList.contains('is-selected')
      && !b.style.getPropertyValue('translate'),
    dragLifecycleCloses:dragStates.length>=4 && dragStates[0]===true && dragStates.at(-1)===false,
  });
  document.body.dataset.details=JSON.stringify({
    ...details,
    documentQuerySelectorAllCalls,
    dropCount,
    droppedTarget,
    droppedPlacement,
    dragStates,
    cardBoundaryTargets,
    reverseBoundaryTargets,
    outerBoundaryTargets,
    appendBoundaryTargets,
    appendReturnTargets,
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

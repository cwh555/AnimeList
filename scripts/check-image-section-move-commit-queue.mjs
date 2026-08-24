import { mkdir, readFile, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-move-commit-queue";
const profile = `${output}/profile`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: `
      export { moveImageSectionAsset } from "./src/ui/image-section-move-coordinator";
      export { scheduleImageSectionMoveParticipantAdoption } from "./src/ui/image-section-move-lifecycle";
      export { prepareImageSectionHostUnload, claimImageSectionHostContinuity } from "./src/ui/image-section-continuity";
      export { armPointerDrag } from "./src/ui/pointer-drag";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${output}/bundle.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListMoveQueueTest",
  target: "es2022",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `export function normalizePath(value) { return String(value || ""); }`,
      }));
    },
  }],
});

const bundle = await readFile(`${output}/bundle.js`, "utf8");
const html = `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee}.section{position:relative;width:320px;height:180px;background:#333;margin:40px}.raw{width:320px;height:180px;background:#f0f;margin:40px}
</style></head><body data-result="pending"><div id="host"></div><button id="click-target" style="position:absolute;left:20px;top:260px;width:100px;height:40px">click</button>
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
 const api=AnimeListMoveQueueTest;
 const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
 const nextFrame=()=>new Promise((resolve)=>requestAnimationFrame(resolve));
 const host=document.querySelector('#host');
 const renderContainer=(paths)=>{const el=document.createElement('section');el.className='section';el.dataset.order=paths.join(',');el.textContent=paths.join(' | ');return el;};
 let persisted=['a.jpg','b.jpg','c.jpg'];
 let currentParticipant=null;
 let concurrent=0,maxConcurrent=0,writes=0;
 let firstWriteDesiredOrder='';
 let firstWriteResolveStart;
 const firstWriteStarted=new Promise((resolve)=>{firstWriteResolveStart=resolve;});
 let freshAdoptedOrder='';
 let freshFirstPaintOrder='';

 const makeParticipant=(container,paths,lineStart=10)=>{
   let owned=true;
   let local=[...paths];
   const participant={
     containerEl:container,
     sourcePath:'Demo.md',
     paths:()=>local,
     locator:()=>({source:local.map((path)=>'- '+path).join('\\n'),lineStart}),
     ownsContainer:()=>owned && container.isConnected,
     applyPaths:(next)=>{local=[...next];container.dataset.order=local.join(',');container.textContent=local.join(' | ');},
     applyState:(state)=>{lineStart=state.lineStart;},
     preserveLayoutAcrossRefresh:()=>{},
     layoutMotion:()=>Promise.resolve(),
     loseOwnership:()=>{owned=false;},
   };
   return participant;
 };

 let oldContainer=renderContainer(persisted);host.appendChild(oldContainer);
 let oldParticipant=makeParticipant(oldContainer,persisted);
 currentParticipant=oldParticipant;
 const stateFor=(paths)=>({source:paths.map((path)=>'- '+path).join('\\n'),lineStart:10,lineEnd:10+paths.length+1});
 const service={
   setSectionOrders:async(_sourcePath,replacements)=>{
     writes+=1;concurrent+=1;maxConcurrent=Math.max(maxConcurrent,concurrent);
     const desired=[...replacements[0].paths];
     if(writes===1){
       firstWriteDesiredOrder=desired.join(',');
       firstWriteResolveStart();
       await delay(90);
       persisted=desired;
       api.prepareImageSectionHostUnload(oldContainer);
       oldParticipant.loseOwnership();
       const raw=document.createElement('pre');raw.className='raw';raw.textContent='RAW';oldContainer.replaceWith(raw);
       const freshContainer=renderContainer(persisted);raw.replaceWith(freshContainer);
       const freshParticipant=makeParticipant(freshContainer,persisted);
       currentParticipant=freshParticipant;
       api.scheduleImageSectionMoveParticipantAdoption(freshParticipant);
       await Promise.resolve();
       freshAdoptedOrder=freshParticipant.paths().join(',');
       api.claimImageSectionHostContinuity(freshContainer,'Demo.md',persisted,10);
       await nextFrame();
       freshFirstPaintOrder=freshParticipant.paths().join(',');
       await delay(350);
     }else{
       await delay(30);
       persisted=desired;
     }
     concurrent-=1;
     return [stateFor(desired)];
   },
 };

 const first=api.moveImageSectionAsset({
   service,source:oldParticipant,target:oldParticipant,path:'a.jpg',targetPath:'c.jpg',placement:'after',
 });
 await firstWriteStarted;
 const persistedAtSecondMoveStart=persisted.join(',');
 const second=api.moveImageSectionAsset({
   service,source:oldParticipant,target:oldParticipant,path:'b.jpg',targetPath:'a.jpg',placement:'after',
 });
 const secondImmediateOrder=oldParticipant.paths().join(',');
 const [firstOutcome,secondOutcome]=await Promise.all([first,second]);
 const finalPersistedOrder=persisted.join(',');

 let clickCount=0;
 const clickTarget=document.querySelector('#click-target');
 clickTarget.addEventListener('click',()=>{clickCount+=1;});
 const startEvent=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:88,pointerType:'mouse',button:0,buttons:1,clientX:30,clientY:280});
 api.armPointerDrag({
   event:startEvent,captureElement:clickTarget,dragElement:clickTarget,
   onMove:()=>{},onDrop:()=>{},
 });
 window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:88,pointerType:'mouse',button:0,buttons:1,clientX:60,clientY:300}));
 window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:88,pointerType:'mouse',button:0,buttons:0,clientX:60,clientY:300}));
 clickTarget.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:60,clientY:300}));
 const compatibilityClickBlocked=clickCount===0;
 window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:89,pointerType:'mouse',button:0,buttons:1,clientX:60,clientY:300}));
 clickTarget.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:60,clientY:300}));
 const nextRealGestureClickDelivered=clickCount===1;

 const expectedFirst='b.jpg,c.jpg,a.jpg';
 const expectedSecond='c.jpg,a.jpg,b.jpg';
 const checks={
   firstMovePersistsExpectedOrder:firstOutcome.status==='moved' && firstWriteDesiredOrder===expectedFirst,
   firstWriteStillPendingAtSecondMove:persistedAtSecondMoveStart==='a.jpg,b.jpg,c.jpg',
   secondMoveUpdatesUiWhileFirstWriteRuns:secondImmediateOrder===expectedSecond,
   replacementAdoptsPendingOrderBeforePaint:freshAdoptedOrder===expectedSecond && freshFirstPaintOrder===expectedSecond,
   noteWritesAreSerialized:maxConcurrent===1 && writes===2,
   latestOrderWins:secondOutcome.status==='moved' && finalPersistedOrder===expectedSecond && currentParticipant.paths().join(',')===expectedSecond,
   compatibilityClickIsSuppressed:compatibilityClickBlocked,
   nextRealPointerGestureIsNotLocked:nextRealGestureClickDelivered,
 };
 const details={...checks,writes,maxConcurrent,firstWriteDesiredOrder,persistedAtSecondMoveStart,secondImmediateOrder,freshAdoptedOrder,freshFirstPaintOrder,finalPersistedOrder};
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(checks).every(Boolean)?'pass':'fail';
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail';});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section move commit queue",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 720 },
    resultTimeoutMs: 5000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

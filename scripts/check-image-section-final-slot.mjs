import { mkdir, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-final-slot";
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
  globalName: "AnimeListImageFinalSlot",
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
  html,body{margin:0;width:100%;height:100%;background:#111}
  #section{position:relative;width:460px;height:160px;margin:32px;padding:12px;box-sizing:border-box}
  .al-image-gallery-viewport{position:relative;width:430px;height:120px}
  .al-image-item{position:absolute;top:0;width:120px;height:100px;background:#555}
  #terminal{left:0} #a{left:140px} #source{left:280px}
</style></head><body data-result="pending">
<section id="section" class="animelist-image-section"><div class="al-image-gallery-viewport">
  <div id="terminal" class="al-image-item" data-image-path="c.jpg"></div>
  <div id="a" class="al-image-item" data-image-path="a.jpg"></div>
  <div id="source" class="al-image-item" data-image-path="b.jpg"></div>
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
 const section=document.querySelector('#section');
 const terminal=document.querySelector('#terminal');
 const source=document.querySelector('#source');
 const lifecycle=new AbortController();
 let paths=['a.jpg','b.jpg','c.jpg'];
 const participant={
   sourcePath:'FinalSlot.md',
   paths:()=>paths,
   applyPaths:(next)=>{ paths=[...next]; },
 };
 let dropped=null;
 const surface={
   containerEl:section,
   participant,
   signal:lifecycle.signal,
   canStart:()=>true,
   closeMenus:()=>{},
   setDragging:()=>{},
   drop:(_source,path,targetPath,placement)=>{ dropped={path,targetPath,placement}; },
 };
 AnimeListImageFinalSlot.registerImageSectionDragSurface(surface);
 const pointerType='touch';
 const id=81;
 const pointer=(type,x,y,buttons)=>new PointerEvent(type,{
   bubbles:true,cancelable:true,pointerId:id,pointerType,isPrimary:true,
   clientX:x,clientY:y,button:0,buttons,
 });
 const sourceRect=source.getBoundingClientRect();
 const terminalRect=terminal.getBoundingClientRect();
 const start={x:sourceRect.left+sourceRect.width/2,y:sourceRect.top+sourceRect.height/2};
 const lower={x:terminalRect.left+terminalRect.width/2,y:terminalRect.top+terminalRect.height*0.82};
 const middle={x:lower.x,y:terminalRect.top+terminalRect.height*0.52};
 const upper={x:lower.x,y:terminalRect.top+terminalRect.height*0.2};

 AnimeListImageFinalSlot.beginImageSectionPointerDrag(surface,source,'b.jpg',pointer('pointerdown',start.x,start.y,1));
 window.dispatchEvent(pointer('pointermove',lower.x,lower.y,1));
 const lowerActivatesAppend=JSON.stringify(paths)===JSON.stringify(['a.jpg','c.jpg','b.jpg'])
   && section.classList.contains('is-image-drag-target')
   && !terminal.classList.contains('is-selected');

 for(let index=0;index<20;index+=1){
   const y=index%2===0?middle.y-2:middle.y+2;
   window.dispatchEvent(pointer('pointermove',middle.x,y,1));
 }
 const midpointJitterKeepsAppend=JSON.stringify(paths)===JSON.stringify(['a.jpg','c.jpg','b.jpg'])
   && !terminal.classList.contains('is-selected');

 window.dispatchEvent(pointer('pointermove',upper.x,upper.y,1));
 const deliberateReturnLeavesAppend=terminal.classList.contains('is-selected')
   && JSON.stringify(paths)===JSON.stringify(['a.jpg','b.jpg','c.jpg']);

 window.dispatchEvent(pointer('pointermove',lower.x,lower.y,1));
 const appendCanBeReentered=JSON.stringify(paths)===JSON.stringify(['a.jpg','c.jpg','b.jpg'])
   && !terminal.classList.contains('is-selected');
 window.dispatchEvent(pointer('pointerup',lower.x,lower.y,0));

 const dropUsesAppend=dropped?.path==='b.jpg' && dropped?.targetPath===null && dropped?.placement==='append';
 const canonicalTerminalBeatsDomOrder=terminal.parentElement?.firstElementChild===terminal && lowerActivatesAppend;
 const details={lowerActivatesAppend,midpointJitterKeepsAppend,deliberateReturnLeavesAppend,appendCanBeReentered,dropUsesAppend,canonicalTerminalBeatsDomOrder};
 document.body.dataset.details=JSON.stringify({...details,pointerType,paths,dropped});
 document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
 lifecycle.abort();
})().catch((error)=>{
 document.body.dataset.details=String(error?.stack||error);
 document.body.dataset.result='fail';
});
</script></body></html>`;

try {
  for (const [name, viewport] of [
    ["mobile", { width: 390, height: 640, deviceScaleFactor: 2, mobile: true }],
    ["desktop", { width: 900, height: 640, deviceScaleFactor: 1 }],
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: `${output}/profile-${name}`,
      testName: `Image Section final drag slot (${name})`,
      requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
      viewport,
      resultTimeoutMs: 15000,
    });
  }
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

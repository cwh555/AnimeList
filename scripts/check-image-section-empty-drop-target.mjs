import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "image-section-empty-drop-target");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";
      export { ImageSectionOrderSession } from "./src/ui/image-section-order-session";
      export { moveImageSectionAsset } from "./src/ui/image-section-move-coordinator";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "bundle.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListEmptyTargetTest",
  target: "es2022",
  logLevel: "warning",
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
          export function setIcon(parent,name){parent.dataset.icon=name||"1";}
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "bundle.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);
const html = `<!doctype html><html><head><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;}
html,body{margin:0;background:#111;color:#eee;font-family:sans-serif}${styles}
#wrap{width:640px;padding:20px;display:grid;gap:24px}.animelist-image-section{width:600px}
</style></head><body data-result="pending"><div id="wrap"><section id="source"></section><section id="target"></section></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
Object.defineProperty(document,"startViewTransition",{value:undefined,configurable:true});
window.addEventListener('error',(event)=>{document.body.dataset.details=String(event.error?.stack||event.message);document.body.dataset.result='fail'});
</script><script>${bundle}</script><script>
const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const center=(element)=>{const rect=element.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}};
const touch=(target,type,x,y,id)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:id,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
const sourcePaths=['a.jpg'];
const targetPaths=['b.jpg'];
const sourceText=()=>sourcePaths.map((entry)=>'- '+entry).join('\\n');
const targetText=()=>targetPaths.map((entry)=>'- '+entry).join('\\n');
const service={
 resolve:(entry)=>({resourcePath:'data:image/gif;base64,R0lGODlhAQABAAAAACw=#'+entry}),
 setColumns:async()=>({source:'',lineStart:0,lineEnd:0}),
 setAsCover:async()=>{},
 removeMany:async()=>'',
 addAssets:async()=>({source:'',duplicatesSkipped:0}),
 fetchRemoteAsset:async()=>{throw new Error('unused')},
 async commitPendingSectionOrders(){},
};
const journal={async loadAll(){return[]},async write(){},async remove(){}};
const orderSession=new AnimeListEmptyTargetTest.ImageSectionOrderSession(journal,service);
const host={app:{}};
const sourceContext={sourcePath:'Demo.md',getSectionInfo:()=>({lineStart:1,lineEnd:4,text:''})};
const targetContext={sourcePath:'Demo.md',getSectionInfo:()=>({lineStart:10,lineEnd:13,text:''})};
(async()=>{
 await orderSession.initialize();
 const sourceEl=document.querySelector('#source');
 const targetEl=document.querySelector('#target');
 const sourceRenderer=new AnimeListEmptyTargetTest.ImageSectionRenderChild(sourceEl,host,service,orderSession,sourceText(),sourceContext);
 const targetRenderer=new AnimeListEmptyTargetTest.ImageSectionRenderChild(targetEl,host,service,orderSession,targetText(),targetContext);
 sourceRenderer.onload(); targetRenderer.onload();
 await AnimeListEmptyTargetTest.moveImageSectionAsset({orderSession,source:sourceRenderer.moveParticipant,target:targetRenderer.moveParticipant,path:'a.jpg',targetPath:'b.jpg',placement:'after'});
 await delay(40);
 const empty=sourceEl.querySelector('.al-image-empty');
 const details={};
 details.lastImageMoveRendersOriginalEmptyState=Boolean(empty)
   && !sourceEl.querySelector('.al-image-manage-delete-button')
   && empty.querySelector('.al-image-empty-icon')?.dataset.icon==='image-plus'
   && Boolean(empty.querySelector('span')?.textContent?.trim())
   && Boolean(empty.querySelector('strong')?.textContent?.trim());
 details.emptyStateRestoresLargeDropTarget=Boolean(empty)
   && empty.getBoundingClientRect().height>=120
   && empty.getBoundingClientRect().width>=500;
 if(empty){
   const movingBack=targetEl.querySelector('.al-image-item[data-image-path="b.jpg"]');
   const handleBack=movingBack.querySelector('.al-image-drag-handle');
   const backFrom=center(handleBack), backTo=center(empty);
   touch(handleBack,'pointerdown',backFrom.x,backFrom.y,52); touch(movingBack,'pointermove',backTo.x,backTo.y,52); await delay(15); touch(movingBack,'pointerup',backTo.x,backTo.y,52);
   await delay(40);
 }
 details.emptyStateAcceptsImageDrop=Boolean(sourceEl.querySelector('.al-image-item[data-image-path="b.jpg"]'));
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
 sourceRenderer.onunload(); targetRenderer.onunload(); orderSession.dispose();
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section empty drop target",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 760, height: 700, deviceScaleFactor: 1 },
    resultTimeoutMs: 15000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

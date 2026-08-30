import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "image-session-layout-regressions");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { ImageSectionRenderChild } from "./src/ui/image-section-renderer";
      export { ImageSectionOrderSession } from "./src/ui/image-section-order-session";
      export { ImageLightboxModal, imageLightboxEntries } from "./src/ui/image-lightbox";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "bundle.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageSessionRegression",
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
              this.modalEl.className = "modal";
              this.contentEl = document.createElement("div");
              this.contentEl.className = "modal-content";
              this.modalEl.appendChild(this.contentEl);
              document.body.appendChild(this.modalEl);
            }
            setTitle(title) { this.title = title; }
            open() { this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice {}
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
  readFile(path.join(output, "bundle.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const svgData = (width, height, fill) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`)}`;
const tallPixel = svgData(200, 600, "#666");
const squarePixel = svgData(300, 300, "#777");
const widePixel = svgData(640, 360, "#888");

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#222;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;--font-ui-small:13px;}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;color:#eee;font-family:sans-serif}${styles}
#section{width:min(720px,calc(100vw - 24px));margin:12px;box-sizing:border-box}
.modal{position:fixed;z-index:100;top:50%;left:50%;box-sizing:border-box;padding:12px;background:#181818;transform:translate(-50%,-50%)}
.modal-content{box-sizing:border-box;padding:8px}
</style></head><body data-result="pending"><section id="section"></section>
<script>
Object.defineProperty(document,"startViewTransition",{value:undefined,configurable:true});
window.matchMedia=(query)=>({matches:false,media:query,addEventListener(){},removeEventListener(){}});
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn,writable:true,configurable:true}); }
</script><script>${bundle}</script><script>
const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const waitFor=async(predicate,timeout=1500)=>{
 const started=performance.now();
 while(performance.now()-started<timeout){if(predicate())return true;await delay(20)}
 return false;
};
const center=(element)=>{const rect=element.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}};
const rectMap=(root)=>Object.fromEntries([...root.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>{
 const rect=item.getBoundingClientRect();
 return [item.dataset.imagePath,{left:rect.left,top:rect.top,width:rect.width,height:rect.height}];
}));
const layoutRectMap=(root)=>Object.fromEntries([...root.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>{
 const rect=item.getBoundingClientRect();
 const parts=item.style.getPropertyValue('translate').trim().split(' ').filter(Boolean);
 const translateX=Number.parseFloat(parts[0]||'0')||0;
 const translateY=Number.parseFloat(parts[1]||'0')||0;
 return [item.dataset.imagePath,{left:rect.left-translateX,top:rect.top-translateY,width:rect.width,height:rect.height}];
}));
const sameRects=(left,right,epsilon=1.5)=>Object.keys(left).length===Object.keys(right).length
 && Object.entries(left).every(([path,rect])=>{
   const other=right[path];
   return Boolean(other) && ['left','top','width','height'].every((key)=>Math.abs(rect[key]-other[key])<=epsilon);
 });
const touch=(target,type,x,y,id)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:id,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
const initial=['tall.jpg','square-1.jpg','square-2.jpg','square-3.jpg','wide.jpg'];
let current=[...initial];
const source=()=>current.map((entry)=>'- '+entry).join('\\n');
const stateFor=(paths)=>({source:paths.map((entry)=>'- '+entry).join('\\n'),lineStart:0,lineEnd:paths.length+1});
const service={
 resolve:(entry)=>({resourcePath:(entry==='tall.jpg'?'${tallPixel}':entry==='wide.jpg'?'${widePixel}':'${squarePixel}')+'#'+entry}),
 setColumns:async()=>stateFor(current),
 setSectionOrders:async(_note,replacements)=>{
   current=[...replacements[0].paths];
   return replacements.map((entry)=>stateFor(entry.paths));
 },
 setAsCover:async()=>{},
 removeMany:async()=>source(),
 addAssets:async()=>({source:source(),duplicatesSkipped:0}),
 fetchRemoteAsset:async()=>{throw new Error('unused')},
};
const journalRecords=new Map();
const journal={
 async loadAll(){return [...journalRecords.values()].map((record)=>structuredClone(record))},
 async write(record){journalRecords.set(record.sourcePath,structuredClone(record))},
 async remove(sourcePath){journalRecords.delete(sourcePath)},
};
const orderSession=new AnimeListImageSessionRegression.ImageSectionOrderSession(journal,service);
const fence=String.fromCharCode(96).repeat(3);
const context={sourcePath:'Regression.md',getSectionInfo:()=>({lineStart:0,lineEnd:current.length+1,text:fence+'animelist-images columns=2\\n'+source()+'\\n'+fence})};
const host={app:{}};
(async()=>{
 await orderSession.initialize();
 const section=document.querySelector('#section');
 const renderer=new AnimeListImageSessionRegression.ImageSectionRenderChild(section,host,service,orderSession,source(),context);
 renderer.onload();
 const details={};

 const imagesReady=await waitFor(()=>[...section.querySelectorAll('.al-image-item img')].length===initial.length && [...section.querySelectorAll('.al-image-item img')].every((image)=>image.complete&&image.naturalWidth>0));
 await delay(260);
 const expand=section.querySelector('.al-image-expand-button');
 if(expand && !expand.hidden) { expand.click(); await delay(30); }
 const placements=Object.fromEntries([...section.querySelectorAll('.al-image-item[data-image-path]')].map((item)=>[
   item.dataset.imagePath,
   {column:Number(item.dataset.masonryColumn),span:Number(item.dataset.masonrySpan),rect:item.getBoundingClientRect()},
 ]));
 details.shortestColumnUsesDecodedImageHeight=imagesReady
   && placements['tall.jpg']?.column===0
   && placements['square-1.jpg']?.column===1
   && placements['square-2.jpg']?.column===1
   && placements['square-3.jpg']?.column===1;
 const widePlacement=placements['wide.jpg'];
 const squarePlacement=placements['square-1.jpg'];
 const galleryRect=section.querySelector('.al-image-masonry').getBoundingClientRect();
 details.minorityLandscapeSpansTwoColumns=widePlacement?.span===2
   && widePlacement.column===0
   && widePlacement.rect.width>squarePlacement.rect.width*1.9
   && widePlacement.rect.left>=galleryRect.left-1.5
   && widePlacement.rect.right<=galleryRect.right+1.5;

 const moving=section.querySelector('.al-image-item[data-image-path="square-2.jpg"]');
 const handle=moving?.querySelector('.al-image-drag-handle');
 const target=section.querySelector('.al-image-item[data-image-path="square-1.jpg"]');
 if(!moving||!handle||!target) throw new Error('drag fixture cards unavailable');
 const initialRects=rectMap(section);
 const from=center(handle), targetRect=target.getBoundingClientRect();
 const to={x:targetRect.left+targetRect.width/2,y:targetRect.top+targetRect.height*0.75};
 touch(handle,'pointerdown',from.x,from.y,91);
 touch(moving,'pointermove',to.x,to.y,91);
 await delay(20);
 details.dragPreviewUsesFlipMotion=[...section.querySelectorAll('.al-image-item[data-image-path]')].some((item)=>item.dataset.layoutMotion==='active');
 await delay(230);
 const previewRects=rectMap(section);
 const previewLayoutRects=layoutRectMap(section);
 details.dragPreviewIsFinalLayout=section.querySelectorAll('.al-image-item[data-image-path]').length===initial.length
   && !section.querySelector('.al-image-drop-placeholder')
   && target.classList.contains('is-selected')
   && Math.abs(previewLayoutRects['square-2.jpg'].top-initialRects['square-1.jpg'].top)<=1.5
   && previewLayoutRects['square-1.jpg'].top>initialRects['square-1.jpg'].top;

 const tallImage=section.querySelector('.al-image-item[data-image-path="tall.jpg"] img');
 tallImage?.dispatchEvent(new Event('load'));
 await delay(40);
 const previewAfterLoadRects=rectMap(section);
 details.dragPreviewSurvivesImageRelayoutSignal=sameRects(previewRects,previewAfterLoadRects);

 touch(moving,'pointerup',to.x,to.y,91);
 await waitFor(()=>Boolean(journalRecords.get('Regression.md')?.sections?.[0]?.paths),1500);
 await delay(230);
 const finalRects=rectMap(section);
 details.dragPreviewMatchesDroppedLayout=sameRects(previewLayoutRects,finalRects);
 details.dragPreviewCleansAfterDrop=!section.querySelector('.al-image-drop-placeholder') && !target.classList.contains('is-selected');
 const pendingOrder=journalRecords.get('Regression.md')?.sections?.[0]?.paths ?? [];
 details.dropMovesSourceIntoTargetSlot=JSON.stringify(pendingOrder)===JSON.stringify(['tall.jpg','square-2.jpg','square-1.jpg','square-3.jpg','wide.jpg']);

 const lightbox=new AnimeListImageSessionRegression.ImageLightboxModal(
   host.app,
   service,
   AnimeListImageSessionRegression.imageLightboxEntries(context.sourcePath,['tall.jpg']),
   0,
 );
 lightbox.open();
 const lightboxReady=await waitFor(()=>{
   const image=document.querySelector('.al-image-lightbox-image');
   return Boolean(image && !image.hidden && image.complete && image.naturalWidth>0);
 });
 await delay(80);
 const modal=document.querySelector('.animelist-image-lightbox');
 const stage=document.querySelector('.al-image-lightbox-stage');
 const image=document.querySelector('.al-image-lightbox-image');
 const counter=document.querySelector('.al-image-lightbox-counter');
 if(!modal||!stage||!image||!counter) throw new Error('lightbox fixture unavailable');
 const modalRect=modal.getBoundingClientRect();
 const stageRect=stage.getBoundingClientRect();
 const imageRect=image.getBoundingClientRect();
 const counterRect=counter.getBoundingClientRect();
 const epsilon=1.5;
 details.lightboxTallImageFitsStage=lightboxReady
   && imageRect.top>=stageRect.top-epsilon
   && imageRect.bottom<=stageRect.bottom+epsilon
   && imageRect.left>=stageRect.left-epsilon
   && imageRect.right<=stageRect.right+epsilon;
 details.lightboxStageDoesNotOverlapCounter=stageRect.bottom<=counterRect.top+epsilon;
 details.lightboxModalStaysInsideViewport=modalRect.top>=-epsilon && modalRect.bottom<=innerHeight+epsilon;
 lightbox.close();

 renderer.onunload();
 orderSession.dispose();
 document.body.dataset.details=JSON.stringify({
   ...details,
   viewport:{width:innerWidth,height:innerHeight},
   placements:Object.fromEntries(Object.entries(placements).map(([path,value])=>[path,{column:value.column,span:value.span,width:value.rect.width,height:value.rect.height}])),
   lightbox:{modalRect,stageRect,imageRect,counterRect},
 });
 document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
})().catch((error)=>{
 document.body.dataset.details=String(error?.stack||error);
 document.body.dataset.result='fail';
});
</script></body></html>`;

try {
  const cases = [
    ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }],
    ["desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }],
  ];
  for (const [name, viewport] of cases) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, `profile-${name}`),
      testName: `Image Session layout regressions (${name})`,
      requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
      viewport,
      resultTimeoutMs: 20000,
    });
  }
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

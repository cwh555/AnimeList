import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "moments-stacked");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { MomentsRenderChild } from "./src/ui/moments-renderer";
      export { MomentEditorModal } from "./src/ui/moments-modal";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "moments-stacked.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListMomentsStacked",
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
            }
            setTitle(value) { this.title = value; }
            open() { document.body.appendChild(this.modalEl); this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice { constructor(message) { (window.__notices ||= []).push(String(message)); } }
          export class TFile {}
          export class MenuItem {
            setTitle(value) { this.title = value; return this; }
            setIcon(value) { this.icon = value; return this; }
            setWarning(value = true) { this.warning = value; return this; }
            onClick(callback) { this.callback = callback; return this; }
          }
          export class Menu {
            constructor() { this.items = []; (window.__menus ||= []).push(this); }
            addItem(callback) { const item = new MenuItem(); callback(item); this.items.push(item); return this; }
            showAtMouseEvent() { return this; }
          }
          export function normalizePath(value) { return String(value || ""); }
          export async function requestUrl() { throw new Error("requestUrl unavailable in browser fixture"); }
          export function setIcon(parent, name) { parent.dataset.icon = name; }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "moments-stacked.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const svg = (label, width, height, base, band) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${base}"/><rect y="${Math.floor(height * 0.76)}" width="100%" height="${Math.ceil(height * 0.24)}" fill="${band}"/><text x="50%" y="90%" dominant-baseline="middle" text-anchor="middle" font-size="34" fill="white">${label} subtitle</text></svg>`)}`;
const a = svg("A", 960, 540, "#4e6380", "#171717");
const b = svg("B", 960, 540, "#805f72", "#202020");
const c = svg("C", 540, 760, "#52735c", "#151515");

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#202020;--background-secondary-alt:#292929;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8170df;--interactive-accent-hover:#9486e8;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-error:#e66;--text-on-accent:#fff;--font-ui-small:13px;--font-ui-smaller:12px;--font-ui-medium:15px;}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}button,input,textarea{font:inherit}
/* Match the Obsidian constraint that feature image buttons must explicitly override. */
button:not(.clickable-icon){height:32px;background:#292929;box-shadow:0 1px 2px rgba(0,0,0,.35)}
${styles}
#reading{width:370px;margin:8px}.modal{box-sizing:border-box;width:370px;margin:8px;padding:8px;background:#181818}.modal-content{max-height:720px;overflow-y:auto}
</style></head><body class="is-mobile" data-result="pending"><section id="reading"></section>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
 setCssStyles:function(styles){Object.assign(this.style,styles)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
</script><script>${bundle}</script><script>
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const nextLayout=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const waitForImages=async(root)=>{
 const images=[...(root?.querySelectorAll("img")||[])];
 await Promise.all(images.map(async image=>{
   if(!image.complete){
     await new Promise(resolve=>{
       image.addEventListener("load",resolve,{once:true});
       image.addEventListener("error",resolve,{once:true});
     });
   }
   if(typeof image.decode==="function"){ try{ await image.decode(); }catch{} }
 }));
 await nextLayout();
};
const matchesIntrinsicRatio=(rect,width,height)=>Boolean(rect) && rect.width>1 && rect.height>1
 && Math.abs(rect.height-(rect.width*height/width))<=2;
const urls={"a.png":"${a}","b.png":"${b}","c.png":"${c}","broken.png":"data:image/png;base64,not-valid"};
const readAssetPaths=[];
let storeCalls=0;
const service={
 resolve:(path)=>({resourcePath:urls[path]}),
 readAsset:async(path)=>{
   readAssetPaths.push(path);
   const image=new Image(); image.src=urls[path]; await image.decode();
   const canvas=document.createElement("canvas"); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
   canvas.getContext("2d").drawImage(image,0,0);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("fixture PNG encode failed")),"image/png"));
   return {name:path,data:await blob.arrayBuffer(),contentType:"image/png"};
 },
 storeAssets:async()=>{storeCalls+=1;throw new Error("stack copy must not persist an image")},
 fetchRemoteAsset:async()=>{throw new Error("unused")},
};
window.__clipboardWrites=[];
class FixtureClipboardItem { constructor(items){ this.items=items; } }
window.ClipboardItem=FixtureClipboardItem;
Object.defineProperty(navigator,"clipboard",{configurable:true,value:{
 write:async(items)=>{window.__clipboardWrites.push(items)},
}});
const context={sourcePath:"Anime/Demo.md",getSectionInfo:()=>({lineStart:0,lineEnd:14})};
const host={app:{}};
const source=[
 "moments:",
 '  - id: "m_stack123"',
 "    text: stacked subtitle fixture",
 "    imageLayout: stacked",
 "    stackGapsY:",
 "      - 0",
 "      - 56",
 "      - 64",
 "    images:",
 '      - "a.png"',
 '      - "b.png"',
 '      - "c.png"',
].join("\\n");
const renderer=new AnimeListMomentsStacked.MomentsRenderChild(document.querySelector("#reading"),host,{},service,source,context);
renderer.onload();
(async()=>{
 const details={};
 const reading=document.querySelector("#reading");
 await waitForImages(reading);
 const stack=reading.querySelector(".al-moment-stack-reading");
 const layers=[...(stack?.querySelectorAll(".al-moment-stack-layer")||[])];
 const images=layers.map(layer=>layer.querySelector("img"));
 const rects=()=>layers.map(layer=>layer.getBoundingClientRect());
 const imageRects=()=>images.map(image=>image?.getBoundingClientRect());
 const initialRects=rects();
 const initialImageRects=imageRects();
 details.readingUsesRealStack=Boolean(stack) && !reading.querySelector(".al-moment-image-row") && layers.length===3;
 details.layersKeepWholeImages=matchesIntrinsicRatio(initialImageRects[0],960,540)
   && matchesIntrinsicRatio(initialImageRects[1],960,540)
   && matchesIntrinsicRatio(initialImageRects[2],540,760);
 details.gapsPositionWholeLayers=Math.abs(initialRects[1].bottom-initialRects[0].bottom-56)<=2
   && Math.abs(initialRects[2].bottom-initialRects[1].bottom-64)<=2;
 details.lowerLayersAreNotCropWindows=matchesIntrinsicRatio(initialRects[1],960,540)
   && matchesIntrinsicRatio(initialRects[2],540,760)
   && Math.abs(initialRects[1].height-initialImageRects[1].height)<=1
   && Math.abs(initialRects[2].height-initialImageRects[2].height)<=1;
 details.mobileReadingDoesNotOverflow=document.documentElement.scrollWidth<=window.innerWidth+1;

 const actionButton=reading.querySelector(".al-moment-actions");
 actionButton.click();
 const copyMenu=window.__menus?.at(-1);
 const copyImagesItem=copyMenu?.items?.find(item=>item.title==="Copy images");
 copyImagesItem?.callback?.();
 for(let attempt=0;attempt<80 && window.__clipboardWrites.length===0;attempt+=1) await delay(25);
 const clipboardWrite=window.__clipboardWrites[0]||[];
 const clipboardItem=clipboardWrite[0];
 const compositeBlob=clipboardItem?.items?.["image/png"];
 details.stackedCopyWritesOneCompositePng=window.__clipboardWrites.length===1
   && clipboardWrite.length===1 && compositeBlob instanceof Blob && compositeBlob.type==="image/png";
 if(compositeBlob instanceof Blob){
   const bitmap=await createImageBitmap(compositeBlob);
   const sampleCanvas=document.createElement("canvas");
   sampleCanvas.width=bitmap.width; sampleCanvas.height=bitmap.height;
   const sampleContext=sampleCanvas.getContext("2d");
   sampleContext.drawImage(bitmap,0,0);
   const cssWidth=stack.clientWidth;
   const copyScale=bitmap.width/cssWidth;
   const topHeightCss=initialRects[0].height;
   const expectedHeight=(topHeightCss+120)*copyScale;
   details.stackedCopyUsesCurrentGeometry=Math.abs(bitmap.height-expectedHeight)<=3;
   const rgbAt=(cssY)=>[...sampleContext.getImageData(Math.floor(bitmap.width*0.08),Math.min(bitmap.height-1,Math.max(0,Math.floor(cssY*copyScale))),1,1).data].slice(0,3);
   const near=(actual,expected)=>actual.every((value,index)=>Math.abs(value-expected[index])<=3);
   const sampled=[rgbAt(30),rgbAt(topHeightCss+40),rgbAt(topHeightCss+56+40)];
   details.stackedCopyPreservesVisibleLayers=near(sampled[0],[78,99,128])
     && near(sampled[1],[32,32,32])
     && near(sampled[2],[21,21,21]);
   bitmap.close();
 }else{
   details.stackedCopyUsesCurrentGeometry=false;
   details.stackedCopyPreservesVisibleLayers=false;
 }
 details.stackedCopyReadsOriginalAssetsOnce=JSON.stringify(readAssetPaths)===JSON.stringify(["a.png","c.png","b.png"]);
 details.stackedCopyDoesNotPersistComposite=storeCalls===0;

 layers[1].dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:20,clientY:20}));
 const layerMenu=window.__menus?.at(-1);
 const layerCopyItem=layerMenu?.items?.find(item=>item.title==="Copy image");
 layerCopyItem?.callback?.();
 for(let attempt=0;attempt<80 && window.__clipboardWrites.length<2;attempt+=1) await delay(25);
 const layerWrite=window.__clipboardWrites[1]||[];
 const layerComposite=layerWrite[0]?.items?.["image/png"];
 details.stackedLayerCopyAlsoUsesComposite=layerWrite.length===1 && layerComposite instanceof Blob
   && layerComposite.type==="image/png" && layerComposite.size===compositeBlob.size;
 details.repeatedCopyDoesNotCacheFiles=storeCalls===0
   && JSON.stringify(readAssetPaths)===JSON.stringify(["a.png","c.png","b.png","a.png","c.png","b.png"]);
 const rasterReadsAfterCopy=readAssetPaths.length;
 const clipboardWritesAfterCopy=window.__clipboardWrites.length;

 let saved=null;
 const initial={id:"m_stack123",text:"stacked subtitle fixture",imageLayout:"stacked",stackGapsY:[0,56,64],images:["a.png","b.png","c.png"]};
 const modal=new AnimeListMomentsStacked.MomentEditorModal({},service,"Anime/Demo.md",initial,async input=>{saved=input});
 modal.open();
 await waitForImages(modal.contentEl);
 const editorLayers=()=>[...modal.contentEl.querySelectorAll('.al-moment-stack-editor .al-moment-stack-layer')];
 details.editorStartsInStackedMode=modal.contentEl.querySelector('.al-moment-editor-layout-mode.is-active')?.textContent?.length>0
   && editorLayers().length===3;
 const editorTileBeforeRerender=modal.contentEl.querySelector('.al-moment-editor-image');
 const editorImageBeforeRerender=editorTileBeforeRerender?.querySelector('img');
 const activeLayoutMode=modal.contentEl.querySelector('.al-moment-editor-layout-mode.is-active');
 activeLayoutMode?.click(); await nextLayout();
 details.editorRerenderPreservesImageNode=!!editorTileBeforeRerender && !!editorImageBeforeRerender
   && modal.contentEl.querySelector('.al-moment-editor-image')===editorTileBeforeRerender
   && modal.contentEl.querySelector('.al-moment-editor-image img')===editorImageBeforeRerender;
 const reveal=modal.contentEl.querySelector('.al-moment-editor-reveal input[type="range"]');
 reveal.value="68"; reveal.dispatchEvent(new Event("input",{bubbles:true}));
 await nextLayout();
 let editorRects=editorLayers().map(layer=>layer.getBoundingClientRect());
 details.revealSliderMovesWholeLayers=Math.abs(editorRects[1].bottom-editorRects[0].bottom-64)<=2
   && Math.abs(editorRects[2].bottom-editorRects[1].bottom-72)<=2
   && matchesIntrinsicRatio(editorRects[1],960,540);
 const layer=editorLayers()[1];
 const beforeRects=editorLayers().map(entry=>entry.getBoundingClientRect());
 const rect=layer.getBoundingClientRect();
 const x=rect.left+rect.width/2, y=rect.bottom-14;
 const pointer=(type,clientY)=>layer.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:17,pointerType:"touch",isPrimary:true,clientX:x,clientY,button:0,buttons:type==="pointerup"?0:1}));
 pointer("pointerdown",y); pointer("pointermove",y-36); pointer("pointerup",y-36); await nextLayout();
 const afterRects=editorLayers().map(entry=>entry.getBoundingClientRect());
 details.touchDragMovesEntireLayer=Math.abs((afterRects[1].bottom-beforeRects[1].bottom)+36)<=2
   && Math.abs((afterRects[2].bottom-beforeRects[2].bottom)+36)<=2
   && Math.abs(afterRects[1].height-beforeRects[1].height)<=1;
 details.touchDragKeepsPageStable=document.documentElement.scrollWidth<=window.innerWidth+1;
 details.editorDragDoesNotRasterizeOrWriteFiles=readAssetPaths.length===rasterReadsAfterCopy
   && window.__clipboardWrites.length===clipboardWritesAfterCopy && storeCalls===0;
 const save=modal.contentEl.querySelector('.al-moment-editor-actions .mod-cta');
 save.click(); await delay(20);
 details.editorPersistsWholeImageLayout=Boolean(saved) && saved.imageLayout==="stacked"
   && saved.stackGapsY?.[0]===0 && saved.stackGapsY?.[1]===28 && saved.stackGapsY?.[2]===72
   && saved.stackReveal===undefined && saved.stackFocusY===undefined;

 const brokenReading=document.createElement("section"); document.body.appendChild(brokenReading);
 const brokenSource=["moments:",'  - id: "m_broken123"',"    text: broken","    images:",'      - "broken.png"'].join("\\n");
 const brokenRenderer=new AnimeListMomentsStacked.MomentsRenderChild(brokenReading,host,{},service,brokenSource,context);
 brokenRenderer.onload(); await delay(100);
 details.momentDecodeFailureFallsBack=!!brokenReading.querySelector('.al-moment-image-missing') && !brokenReading.querySelector('.al-moment-image img');
 brokenRenderer.onunload(); brokenReading.remove();

 const brokenEditor=new AnimeListMomentsStacked.MomentEditorModal({},service,"Anime/Demo.md",{id:"m_brokeneditor",text:"broken",images:["broken.png"]},async()=>{});
 brokenEditor.open(); await delay(100);
 details.momentEditorDecodeFailureFallsBack=!!brokenEditor.contentEl.querySelector('.al-moment-editor-image-missing') && !brokenEditor.contentEl.querySelector('.al-moment-editor-image img');
 brokenEditor.close();

 const legacyInitial={id:"m_legacy123",text:"legacy",images:["a.png","b.png"]};
 const legacy=new AnimeListMomentsStacked.MomentEditorModal({},service,"Anime/Demo.md",legacyInitial,async()=>{});
 legacy.open(); await delay(20);
 details.legacyDefaultsToCarousel=legacy.contentEl.querySelector('.al-moment-editor-layout-mode.is-active')?.textContent!==""
   && legacy.contentEl.querySelector('.al-moment-editor-images')?.getAttribute('data-ignore-swipe')==='true'
   && !legacy.contentEl.hasAttribute('data-ignore-swipe')
   && !legacy.contentEl.querySelector('.al-moment-stack-editor');
 legacy.close();
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?"pass":"fail";
})().catch(error=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result="fail"});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Moments whole-image stacked subtitle layout and touch adjustment",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    resultTimeoutMs: 8000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

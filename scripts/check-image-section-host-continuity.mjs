import { mkdir, readFile, rm } from "node:fs/promises";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const output = ".tmp/image-section-host-continuity";
const profile = (name) => `${output}/profile-${name}`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: `export { ImageSectionRenderChild } from "./src/ui/image-section-renderer"; export { reorderImageSectionPaths } from "./src/domain/image-section-order";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${output}/bundle.js`,
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListImageHostTest",
  target: "es2022",
  plugins: [{
    name: "obsidian-stub",
    setup(esbuild) {
      esbuild.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      esbuild.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export class MarkdownRenderChild { constructor(containerEl) { this.containerEl = containerEl; } }
          export class Modal { constructor() { this.modalEl = document.createElement("div"); this.contentEl = document.createElement("div"); this.modalEl.append(this.contentEl); } open() { this.onOpen?.(); this.modalEl.classList.add("animelist-image-lightbox"); document.body.append(this.modalEl); } close() { this.onClose?.(); this.modalEl.remove(); } }
          export class Notice {}
          export class TFile {}
          export function normalizePath(value) { return String(value || ""); }
          export function setIcon() {}
          export class Menu { addItem() { return this; } showAtMouseEvent() {} }
          export async function requestUrl() { throw new Error("unused"); }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(`${output}/bundle.js`, "utf8"),
  readFile("styles.css", "utf8"),
]);
const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function fixture({ disableViewTransition = false, disableWaitUntil = false, replacementDelays }) {
  return `<!doctype html><html><head><style>
    :root{--background-primary:#111;--background-secondary:#222;--background-modifier-border:#444;--interactive-accent:#8b5cf6;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777}
    ${styles}
    body{margin:0;background:#111;color:#eee}#preview{width:390px;margin:30px}
    .host-raw{display:block;min-height:260px;padding:12px;background:#ff00ff;color:#000;font:700 20px sans-serif}
    #outside-probe{position:fixed;z-index:1;top:4px;left:4px;width:20px;height:20px;padding:0;border:0;background:#0f0}
  </style></head><body data-result="pending"><button id="outside-probe" type="button" aria-label="outside probe"></button><div id="preview"><section id="section"></section></div>
  <script>
    window.createEl=(tag)=>document.createElement(tag);
    for(const [name,fn] of Object.entries({addClass:function(...x){this.classList.add(...x)},removeClass:function(...x){this.classList.remove(...x)},toggleClass:function(n,v){this.classList.toggle(n,v)}})){
      if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn});
    }
    ${disableViewTransition ? `Object.defineProperty(document,"startViewTransition",{value:undefined,configurable:true});` : ""}
    ${disableWaitUntil ? `Object.defineProperty(ViewTransition.prototype,"waitUntil",{value:undefined,configurable:true});` : ""}
  </script><script>${bundle}</script><script>
    const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
    let current=["a.jpg","b.jpg","c.jpg","d.jpg","e.jpg","f.jpg"];
    let renderer;
    let section=document.querySelector("#section");
    const source=()=>current.map((path)=>"- "+path).join("\\n");
    const context=()=>({sourcePath:"Demo.md",getSectionInfo:()=>({lineStart:10,lineEnd:17,text:"animelist-images"})});
    const host={app:{}};
    let expectedOldImage=null;
    let replacementCount=0;
    let freshReplacementCount=0;
    let persistenceCount=0;
    const replacementDelays=${JSON.stringify(replacementDelays)};
    let rawDomObserved=false;
    let rawRafSamples=0;
    let coveredRawRafSamples=0;
    let outsideHitSamples=0;
    let continuityClassSamples=0;
    let lightboxSamples=0;
    let tracing=true;

    function mountRenderer(element){
      renderer=new AnimeListImageHostTest.ImageSectionRenderChild(element,host,service,source(),context());
      renderer.onload();
      section=element;
      const replacementImage=element.querySelector('[data-image-path="a.jpg"] img');
      if(expectedOldImage){
        replacementCount+=1;
        if(replacementImage && replacementImage!==expectedOldImage) freshReplacementCount+=1;
        expectedOldImage=null;
      }
    }

    async function simulateObsidianHostReplacement(){
      renderer.onunload();
      const raw=document.createElement("pre");
      raw.className="host-raw";
      raw.dataset.hostSurface="raw-code-block";
      raw.textContent="RAW MARKDOWN HOST";
      section.replaceWith(raw);
      rawDomObserved=true;
      await delay(140);
      const fresh=document.createElement("section");
      fresh.id="section";
      raw.replaceWith(fresh);
      mountRenderer(fresh);
    }

    const service={
      resolve:(path)=>({resourcePath:"${pixel}#"+path}),
      setColumns:async()=>({source:source(),lineStart:10,lineEnd:17}),
      moveAsset:async(_note,_source,_target,moving,target,placement)=>{
        await delay(35);
        current=AnimeListImageHostTest.reorderImageSectionPaths(current,moving,target,placement);
        const replacementDelay=replacementDelays[Math.min(persistenceCount,replacementDelays.length-1)] ?? 80;
        persistenceCount+=1;
        setTimeout(()=>void simulateObsidianHostReplacement(),replacementDelay);
        return {sourceSection:{source:source(),lineStart:10,lineEnd:17},targetSection:{source:source(),lineStart:10,lineEnd:17},markdown:""};
      },
      setAsCover:async()=>{},removeMany:async()=>source(),addAssets:async()=>({source:source(),duplicatesSkipped:0}),fetchRemoteAsset:async()=>{throw new Error("unused")},
    };
    mountRenderer(section);

    function sample(){
      if(!tracing) return;
      const raw=document.querySelector('[data-host-surface="raw-code-block"]');
      if(raw){
        rawRafSamples+=1;
        const probe=document.querySelector('#outside-probe');
        const probeRect=probe.getBoundingClientRect();
        if(document.elementFromPoint(probeRect.left+probeRect.width/2,probeRect.top+probeRect.height/2)===probe) outsideHitSamples+=1;
        if(document.documentElement.classList.contains('al-image-continuity-active')) continuityClassSamples+=1;
        try {
          const oldStyle=getComputedStyle(document.documentElement,'::view-transition-old(al-image-section-0)');
          const newStyle=getComputedStyle(document.documentElement,'::view-transition-new(al-image-section-0)');
          const oldOpacity=Number.parseFloat(oldStyle.opacity);
          const newOpacity=Number.parseFloat(newStyle.opacity);
          if(oldOpacity>=0.99 && newOpacity<=0.01) coveredRawRafSamples+=1;
        } catch {}
      }
      if(document.querySelector('.animelist-image-lightbox')) lightboxSamples+=1;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);

    (async()=>{
      await delay(100);
      const control=${disableViewTransition ? "true" : "false"};
      const legacyBlocking=${disableWaitUntil ? "true" : "false"};
      const iterations=replacementDelays.length;
      const pointer=(element,type,x,y,pointerId)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId,pointerType:"touch",isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==="pointerup"?0:1}));
      for(let iteration=0;iteration<iterations;iteration+=1){
        const moving=document.querySelector('[data-image-path="a.jpg"]');
        const handle=moving.querySelector('.al-image-drag-handle');
        const ordered=[...document.querySelectorAll('.al-image-item')].map((item)=>item.dataset.imagePath);
        const aIndex=ordered.indexOf("a.jpg");
        const targetPath=aIndex<ordered.length-1?ordered[ordered.length-1]:ordered[0];
        const target=document.querySelector('[data-image-path="'+targetPath+'"]');
        const start=handle.getBoundingClientRect();
        const end=target.getBoundingClientRect();
        expectedOldImage=moving.querySelector('img');
        pointer(handle,"pointerdown",start.left+start.width/2,start.top+start.height/2,17+iteration);
        pointer(moving,"pointermove",end.left+end.width/2,aIndex<ordered.length-1?end.bottom-2:end.top+2,17+iteration);
        pointer(moving,"pointerup",end.left+end.width/2,aIndex<ordered.length-1?end.bottom-2:end.top+2,17+iteration);
        for(let wait=0;wait<160;wait+=1){
          if(replacementCount>=iteration+1 && document.querySelector('[data-image-path="a.jpg"]') && !document.querySelector('[data-host-surface]')) break;
          await delay(20);
        }
      }
      await delay(120);
      tracing=false;
      const gallery=document.querySelector('.animelist-image-section');
      const details={
        viewTransitionSupported:typeof Document.prototype.startViewTransition==="function",
        waitUntilSupported:typeof ViewTransition!=="undefined" && typeof ViewTransition.prototype.waitUntil==="function",
        rawDomObserved,
        rawRafSamples,
        coveredRawRafSamples,
        outsideHitSamples,
        continuityClassSamples,
        lightboxSamples,
        replacementMounted:Boolean(gallery),
        replacementCount,
        freshReplacementCount,
        iterations,
        replacementDelays,
      };
      const common=details.rawDomObserved && details.replacementMounted && details.replacementCount===iterations && details.freshReplacementCount===iterations && details.lightboxSamples===0;
      const controlResult=details.rawRafSamples>0 && details.coveredRawRafSamples===0 && details.continuityClassSamples===0;
      const legacyBlockingResult=!details.waitUntilSupported && details.rawRafSamples===0 && details.continuityClassSamples===0;
      const continuityResult=details.waitUntilSupported && details.rawRafSamples>0
        && details.coveredRawRafSamples===details.rawRafSamples
        && details.outsideHitSamples===details.rawRafSamples
        && details.continuityClassSamples===details.rawRafSamples;
      document.body.dataset.details=JSON.stringify(details);
      document.body.dataset.result=(common && (control ? controlResult : legacyBlocking ? legacyBlockingResult : continuityResult))?"pass":"fail";
    })().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result="fail"});
  </script></body></html>`;
}

try {
  await runChromiumDatasetTest({
    html: fixture({ disableViewTransition: true, replacementDelays: [80] }),
    profile: profile("control"),
    testName: "Image Section host-rerender flash control reproduction",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 820 },
    resultTimeoutMs: 20000,
  });
  await runChromiumDatasetTest({
    html: fixture({ disableWaitUntil: true, replacementDelays: [120] }),
    profile: profile("legacy-blocking"),
    testName: "Image Section host-rerender legacy blocking fallback",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 820 },
    resultTimeoutMs: 20000,
  });
  await runChromiumDatasetTest({
    html: fixture({ replacementDelays: [80, 150, 300, 600, 1200, 300, 600, 80] }),
    profile: profile("continuity"),
    testName: "Image Section host-rerender compositor continuity",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 480, height: 820 },
    resultTimeoutMs: 20000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

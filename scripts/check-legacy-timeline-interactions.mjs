import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "legacy-timeline-interactions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { TimelineUI } from "./src/ui/timeline-renderer";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "legacy-timeline-interactions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListLegacyTimeline",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export function setIcon() {}`,
        loader: "js",
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "legacy-timeline-interactions.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const cover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='180'%3E%3Crect width='120' height='180' fill='%23777'/%3E%3C/svg%3E";
const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-secondary:#222;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7777dd;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;--text-accent:#9aa8ff}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}.animelist-timeline-modal{width:1000px;height:700px;margin:12px auto}.modal-content{height:100%}${styles}
</style></head><body data-result="pending"><div class="animelist-timeline-modal"><div id="timeline" class="modal-content"></div></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({addClass:function(...n){this.classList.add(...n)},removeClass:function(...n){this.classList.remove(...n)},toggleClass:function(n,f){this.classList.toggle(n,f)}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}
</script><script>${bundle}</script><script>
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const item=(title,date,type="anime")=>({title,originalTitle:title,mediaType:type,format:"TV",status:"completed",releaseStatus:"finished",progress:12,total:12,unit:"ep",score:8.5,favorite:false,year:2024,genres:[],people:[],platforms:[],sourceUrls:[],cover:"${cover}",filePath:title+".md",updated:0,updatedLabel:"",startedAt:"",completedAt:date,volumeLog:[]});
const items=[item("Early","2024-01-01"),item("Middle","2024-04-01"),item("Late","2024-10-01"),item("Unknown","unknown")];
const root=document.querySelector("#timeline");
AnimeListLegacyTimeline.TimelineUI.render(root,items,{openFile:()=>{}});
(async()=>{
 const details={};
 await delay(260); await frames();
 const scene=root.querySelector('.al-timeline-scene');
 const datedCards=[...scene.querySelectorAll('.al-timeline-card')];
 const card=datedCards[1];
 const image=card?.querySelector('img');
 if(!scene||!card||!image) throw new Error('Missing legacy Timeline dated poster');
 const leftBefore=card.style.left;
 const unknown=root.querySelector('.al-timeline-temporal-dimension[data-temporal-dimension="unknown"]');
 const unknownCard=unknown?.querySelector('.al-timeline-undated-card');
 details.legacyUnknownParallelDimension=!!unknown && !!unknownCard && !scene.contains(unknownCard)
   && getComputedStyle(unknown).display==='grid'
   && getComputedStyle(unknownCard).position==='relative'
   && Math.abs(unknownCard.getBoundingClientRect().width-72)<=2;
 const zoomOut=root.querySelector('.al-timeline-control-group button');
 zoomOut?.click(); await frames();
 details.legacyTimelineUsesLayoutMotion=card.dataset.layoutMotion==='active'||card.getAnimations().length>0;
 details.legacyTimelineGeometryActuallyChanged=card.style.left!==leftBefore;
 await delay(240); await frames();
 const settledCards=[...root.querySelector('.al-timeline-scene').querySelectorAll('.al-timeline-card')];
 details.legacyTimelinePreservesPosterAndCover=settledCards[1]===card && settledCards[1]?.querySelector('img')===image;
 details.legacyTimelineMotionSettles=card.dataset.layoutMotion!=='active' && card.getAnimations().length===0;
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
})().catch(error=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Legacy Timeline layout motion and unknown completion dimension",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1200, height: 760, deviceScaleFactor: 1, mobile: false },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

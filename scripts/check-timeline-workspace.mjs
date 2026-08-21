import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "timeline-workspace");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { renderAnimeListWorkspaceShell } from "./src/ui/workspace-shell";
      export { renderTimelineWorkspace } from "./src/ui/timeline-workspace-renderer";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "timeline-workspace.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListTimelineTest",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(context) {
      context.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      context.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export class Menu { addItem() { return this; } showAtMouseEvent() {} }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "timeline-workspace.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="100%" height="100%" fill="#555"/></svg>')}`;
const item = (title, type, date, path) => `({title:${JSON.stringify(title)},originalTitle:${JSON.stringify(title)},mediaType:${JSON.stringify(type)},format:"TV",status:"completed",releaseStatus:"finished",progress:1,total:1,unit:"ep",score:9,favorite:false,year:2026,genres:[],people:[],platforms:[],sourceUrls:[],cover:${JSON.stringify(cover)},filePath:${JSON.stringify(path)},updated:0,updatedLabel:"",startedAt:${JSON.stringify(date)},completedAt:${JSON.stringify(date)},volumeLog:[]})`;
const items = [
  item("A", "anime", "2026-01-01", "A.md"),
  item("B", "anime", "2026-01-01", "B.md"),
  item("C", "anime", "2026-01-30", "C.md"),
  item("M", "manga", "2026-02-15", "M.md"),
].join(",");

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#171717;--background-secondary:#202020;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--background-modifier-box-shadow:#000;--interactive-accent:#8070df;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}button{font:inherit}${styles}</style></head><body data-result="pending"><div id="app" class="animelist-native-view"></div>
<script>window.createEl=(tag)=>document.createElement(tag); for(const [name,fn] of Object.entries({addClass:function(...n){this.classList.add(...n)},removeClass:function(...n){this.classList.remove(...n)},toggleClass:function(n,f){this.classList.toggle(n,f)}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}</script>
<script>${bundle}</script><script>
const items=[${items}];
const app=document.querySelector('#app');
const page={id:'timeline',label:'Timeline',icon:'clock-3',order:20,render(el){AnimeListTimelineTest.renderTimelineWorkspace(el,items,{maxStackDepth:3,openFile:()=>{}})}};
const result=AnimeListTimelineTest.renderAnimeListWorkspaceShell(app,{pages:[page],activeSection:'timeline',onSelect:()=>{}}); page.render(result.page);
const click=(el,x)=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x||0}));
const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
(async()=>{ await frames(); const d={};
 const shell=document.querySelector('.al-workspace-shell'); const root=document.querySelector('.al-timeline-workspace'); const viewport=document.querySelector('.al-timeline-workspace-viewport');
 d.fullPageNoModalFrame=!!root&&!document.querySelector('.al-timeline-toolbar')&&!document.querySelector('.al-timeline-copy')&&parseFloat(getComputedStyle(root).borderRadius||'0')===0;
 d.noPageOverflow=document.documentElement.scrollWidth<=document.documentElement.clientWidth;
 d.hasDensity=document.querySelectorAll('.al-timeline-overview-bar').length>0&&!!document.querySelector('.al-timeline-overview-window');
 const cards=[...document.querySelectorAll('.al-timeline-card')]; const axis=document.querySelector('.al-timeline-axis');
 d.fixedPoster=cards.length===4&&cards.every(c=>Math.abs(c.getBoundingClientRect().height-180)<=2&&Math.abs(c.querySelector('img').getBoundingClientRect().height-180)<=2);
 const sameDay=cards.slice(0,2); const axisY=parseFloat(axis.style.top); const above=sameDay.filter(c=>parseFloat(c.style.top)+180<axisY+1).length; const below=sameDay.filter(c=>parseFloat(c.style.top)>axisY-1).length;
 d.responsiveLane=shell.dataset.windowSize==='compact'?above===2&&below===0:above>=1&&below>=1;
 const beforeGap=Math.abs(parseFloat(cards[2].style.left)-parseFloat(cards[0].style.left)); const beforeHeight=cards[0].getBoundingClientRect().height;
 click(document.querySelector('.al-timeline-control-group button:last-child')); await frames();
 const zoomCards=[...document.querySelectorAll('.al-timeline-card')]; const afterGap=Math.abs(parseFloat(zoomCards[2].style.left)-parseFloat(zoomCards[0].style.left));
 d.temporalZoomOnly=afterGap>beforeGap&&Math.abs(zoomCards[0].getBoundingClientRect().height-beforeHeight)<=2;
 const overview=document.querySelector('.al-timeline-overview'); const scene=document.querySelector('.al-timeline-scene'); const beforeTransform=scene.style.transform; const r=overview.getBoundingClientRect(); click(overview,r.left+r.width*.15); await frames(); d.overviewNavigation=scene.style.transform!==beforeTransform;
 const manga=[...document.querySelectorAll('.al-timeline-type-filter')].find(b=>b.textContent.includes('Manga')||b.textContent.includes('漫畫')); click(manga); await frames();
 d.filterApplied=document.querySelectorAll('.al-timeline-card').length===1;
 click(document.querySelectorAll('.al-timeline-view-mode')[1]); await frames(); d.historyMode=!!document.querySelector('.al-timeline-history')&&document.querySelectorAll('.al-timeline-history-item').length===1;
 d.filterPreserved=manga.getAttribute('aria-pressed')==='true';
 d.historyHasExternalDate=!!document.querySelector('.al-timeline-history-date')&&!document.querySelector('.al-timeline-history-item .al-timeline-card-copy small');
 document.body.dataset.details=JSON.stringify(d); document.body.dataset.result=Object.values(d).every(Boolean)?'pass':'fail';
})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  for (const viewport of [
    { width: 2048, height: 900 },
    { width: 1000, height: 900 },
    { width: 820, height: 900 },
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, `chrome-${viewport.width}`),
      testName: `Timeline workspace ${viewport.width}px`,
      requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
      viewport,
    });
  }
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

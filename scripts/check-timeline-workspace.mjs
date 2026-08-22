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
  item("U", "novel", "unknown", "U.md"),
].join(",");

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#171717;--background-secondary:#202020;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--background-modifier-box-shadow:#000;--interactive-accent:#8070df;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}button{font:inherit}${styles}</style></head><body data-result="pending"><div id="app" class="animelist-native-view"></div>
<script>window.createEl=(tag)=>document.createElement(tag); if(!Node.prototype.createSvg)Object.defineProperty(Node.prototype,"createSvg",{value:function(tag){const el=document.createElementNS("http://www.w3.org/2000/svg",tag);this.appendChild(el);return el;}}); for(const [name,fn] of Object.entries({addClass:function(...n){this.classList.add(...n)},removeClass:function(...n){this.classList.remove(...n)},toggleClass:function(n,f){this.classList.toggle(n,f)}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}</script>
<script>${bundle}</script><script>
const items=[${items}];
const app=document.querySelector('#app');
const page={id:'timeline',label:'Timeline',icon:'clock-3',order:20,render(el){AnimeListTimelineTest.renderTimelineWorkspace(el,items,{maxStackDepth:3,openFile:()=>{}})}};
const result=AnimeListTimelineTest.renderAnimeListWorkspaceShell(app,{pages:[page],activeSection:'timeline',onSelect:()=>{}}); page.render(result.page);
const click=(el,x)=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x||0}));
const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
(async()=>{ await frames(); const d={};
 const shell=document.querySelector('.al-workspace-shell'); const root=document.querySelector('.al-timeline-workspace'); let viewport=document.querySelector('.al-timeline-workspace-viewport');
 const axisScreenY=()=>{const a=document.querySelector('.al-timeline-axis');const r=a.getBoundingClientRect();return r.top+r.height/2;};
 const viewportCenter=()=>{const r=viewport.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 const datedCards=()=>[...document.querySelectorAll('.al-timeline-scene .al-timeline-card')];
 const latestCenterX=()=>{const c=datedCards().at(-1).getBoundingClientRect();return c.left+c.width/2;};
 d.fullPageNoModalFrame=!!root&&!document.querySelector('.al-timeline-toolbar')&&!document.querySelector('.al-timeline-copy')&&parseFloat(getComputedStyle(root).borderRadius||'0')===0;
 d.noPageOverflow=document.documentElement.scrollWidth<=document.documentElement.clientWidth;
 d.hasDensityCurve=!!document.querySelector('.al-timeline-density-line')&&!!document.querySelector('.al-timeline-density-area')&&!document.querySelector('.al-timeline-overview-bar')&&!!document.querySelector('.al-timeline-overview-window');
 d.undatedSeparateDimension=document.querySelectorAll('.al-timeline-card:not(.al-timeline-undated-card)').length===4
   && document.querySelectorAll('.al-timeline-undated-card').length===1
   && !!document.querySelector('.al-timeline-undated-dimension');
 const overviewInitial=document.querySelector('.al-timeline-overview'); const overviewWindowInitial=document.querySelector('.al-timeline-overview-window'); const overviewInitialRect=overviewInitial.getBoundingClientRect(); const viewportInitialRect=viewport.getBoundingClientRect(); const appRect=app.getBoundingClientRect(); const overviewStyle=getComputedStyle(overviewInitial); const overviewWindowStyle=getComputedStyle(overviewWindowInitial);
 d.timelineOwnsLeafViewport=app.classList.contains('is-timeline-workspace')&&app.scrollHeight<=app.clientHeight+1&&appRect.bottom<=innerHeight+1;
 d.noVerticalPageOverflow=document.documentElement.scrollHeight<=document.documentElement.clientHeight+1&&document.body.scrollHeight<=document.body.clientHeight+1;
 d.overviewBelowCanvas=overviewInitial.parentElement===document.querySelector('.al-timeline-workspace-body')&&overviewInitialRect.top>=viewportInitialRect.bottom-1;
 d.overviewVisibleInsideLeaf=overviewInitialRect.bottom<=appRect.bottom+1&&overviewInitialRect.bottom>viewportInitialRect.bottom&&overviewInitialRect.left>=appRect.left&&overviewInitialRect.right<=appRect.right;
 d.materialOverviewSurface=parseFloat(overviewStyle.borderRadius)>=14&&overviewStyle.backgroundColor!=='rgba(0, 0, 0, 0)'&&overviewStyle.backgroundColor!=='transparent';
 d.materialOverviewIndicator=parseFloat(overviewWindowStyle.borderTopWidth)<=0.1&&parseFloat(overviewWindowStyle.borderRadius)>=8&&overviewWindowStyle.backgroundColor!=='rgba(0, 0, 0, 0)'&&overviewWindowStyle.backgroundColor!=='transparent';
 let cards=datedCards(); let axis=document.querySelector('.al-timeline-axis');
 d.fixedPosterBase=cards.length===4&&cards.every(c=>Math.abs(c.getBoundingClientRect().height-180)<=2&&Math.abs(c.querySelector('img').getBoundingClientRect().height-180)<=2);
 d.initialLatestCentered=Math.abs(latestCenterX()-viewportCenter().x)<=2;
 d.initialAxisCentered=Math.abs(axisScreenY()-viewportCenter().y)<=2;
 const sameDay=cards.slice(0,2); const axisY=parseFloat(axis.style.top); const above=sameDay.filter(c=>parseFloat(c.style.top)+180<axisY+1).length; const below=sameDay.filter(c=>parseFloat(c.style.top)>axisY-1).length;
 d.responsiveLane=shell.dataset.windowSize==='compact'?above===2&&below===0:above>=1&&below>=1;
 const beforeGap=Math.abs(parseFloat(cards[2].style.left)-parseFloat(cards[0].style.left)); const beforeHeight=cards[0].getBoundingClientRect().height; const axisBeforeTemporal=axisScreenY();
 click(document.querySelector('.al-timeline-spacing-controls button:last-child')); await frames();
 cards=datedCards(); const afterGap=Math.abs(parseFloat(cards[2].style.left)-parseFloat(cards[0].style.left));
 d.temporalZoomOnly=afterGap>beforeGap&&Math.abs(cards[0].getBoundingClientRect().height-beforeHeight)<=2;
 d.temporalZoomKeepsAxisY=Math.abs(axisScreenY()-axisBeforeTemporal)<=1;
 const rawGapBeforeScreenZoom=afterGap; const screenHeightBefore=cards[0].getBoundingClientRect().height; const axisBeforeScreenZoom=axisScreenY();
 click(document.querySelector('.al-timeline-view-scale-controls button:last-child')); await frames();
 cards=datedCards(); const rawGapAfterScreenZoom=Math.abs(parseFloat(cards[2].style.left)-parseFloat(cards[0].style.left));
 d.screenZoomScalesScene=cards[0].getBoundingClientRect().height>screenHeightBefore*1.1&&Math.abs(rawGapAfterScreenZoom-rawGapBeforeScreenZoom)<=0.1;
 d.screenZoomKeepsAxisY=Math.abs(axisScreenY()-axisBeforeScreenZoom)<=1;
 const scene=document.querySelector('.al-timeline-scene'); const transformBeforeSwipe=scene.style.transform; const axisBeforeSwipe=axisScreenY();
 viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:120,deltaY:0})); await frames();
 d.horizontalSwipePans=scene.style.transform!==transformBeforeSwipe;
 d.horizontalSwipeKeepsAxisY=Math.abs(axisScreenY()-axisBeforeSwipe)<=1;
 const overviewBottomBeforeVerticalPan=overviewInitial.getBoundingClientRect().bottom; viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:0,deltaY:120})); await frames();
 d.overviewStableWhileScenePans=Math.abs(overviewInitial.getBoundingClientRect().bottom-overviewBottomBeforeVerticalPan)<=1;
 const resetButton=document.querySelectorAll('.al-timeline-tool-button')[1]; click(resetButton); await frames();
 viewport=document.querySelector('.al-timeline-workspace-viewport'); cards=datedCards();
 d.resetCentersLatest=Math.abs(latestCenterX()-viewportCenter().x)<=2;
 d.resetCentersAxis=Math.abs(axisScreenY()-viewportCenter().y)<=2;
 d.resetRestoresScale=Math.abs(cards[0].getBoundingClientRect().height-180)<=2;
 const overview=document.querySelector('.al-timeline-overview'); const chart=document.querySelector('.al-timeline-overview-chart'); const beforeTransform=scene.style.transform; const axisBeforeOverview=axisScreenY(); const r=chart.getBoundingClientRect(); click(overview,r.left+r.width*.15); await frames(); d.overviewNavigation=scene.style.transform!==beforeTransform;
 d.overviewKeepsAxisY=Math.abs(axisScreenY()-axisBeforeOverview)<=1;
 d.overviewAccessible=overview.getAttribute('role')==='slider'&&overview.hasAttribute('aria-valuenow')&&!!overview.getAttribute('aria-valuetext');
 const manga=[...document.querySelectorAll('.al-timeline-type-filter')].find(b=>b.textContent.includes('Manga')||b.textContent.includes('漫畫')); click(manga); await frames();
 d.filterApplied=document.querySelectorAll('.al-timeline-card').length===1;
 click(document.querySelectorAll('.al-timeline-view-mode')[1]); await frames(); d.historyMode=!!document.querySelector('.al-timeline-history')&&document.querySelectorAll('.al-timeline-history-item').length===1;
 d.historyUndatedRespectsTypeFilter=!document.querySelector('.al-timeline-history .al-timeline-undated-card');
 d.filterPreserved=manga.getAttribute('aria-pressed')==='true';
 d.historyHasExternalDate=!!document.querySelector('.al-timeline-history-date')&&!document.querySelector('.al-timeline-history-item .al-timeline-card-copy small');
 d.historyScrollContained=app.scrollHeight<=app.clientHeight+1&&document.querySelector('.al-timeline-workspace-body').scrollHeight>=document.querySelector('.al-timeline-workspace-body').clientHeight;
 d.noPageOverflow=document.documentElement.scrollWidth<=document.documentElement.clientWidth;
 d.noVerticalPageOverflow=document.documentElement.scrollHeight<=document.documentElement.clientHeight+1&&document.body.scrollHeight<=document.body.clientHeight+1;
 document.body.dataset.details=JSON.stringify(d); document.body.dataset.result=Object.values(d).every(Boolean)?'pass':'fail';
})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  for (const viewport of [
    { width: 2048, height: 900 },
    { width: 1504, height: 1024 },
    { width: 1000, height: 620 },
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

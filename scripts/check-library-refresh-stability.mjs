import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-refresh-stability");
const desktopProfile = path.join(output, "chrome-profile-desktop");
const mobileProfile = path.join(output, "chrome-profile-mobile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { AnimeListView } from "./src/ui/library-view";
      export { AnimeListUI } from "./src/ui/library-renderer";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "library-refresh-stability.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListRefreshStability",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export class ItemView {
            constructor(leaf) {
              this.leaf = leaf;
              this.contentEl = leaf.contentEl;
              this.containerEl = leaf.containerEl ?? leaf.contentEl;
            }
          }
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export class MenuItem {
            setTitle(value) { this.title = value; return this; }
            setIcon(value) { this.icon = value; return this; }
            onClick(value) { this.callback = value; return this; }
          }
          export class Menu {
            addItem(callback) { callback(new MenuItem()); return this; }
            showAtMouseEvent() { return this; }
          }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "library-refresh-stability.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root {
  --background-primary:#111; --background-primary-alt:#171717; --background-secondary:#202020;
  --background-secondary-alt:#282828; --background-modifier-border:#444; --background-modifier-hover:#333;
  --interactive-accent:#8257e6; --text-normal:#eee; --text-muted:#aaa; --text-faint:#777; --text-on-accent:#fff;
}
html,body { margin:0; width:100%; height:100%; background:#111; color:#eee; font-family:sans-serif; }
button,input,select { font:inherit; }
${styles}
#app.animelist-native-view { height:620px !important; overflow:auto !important; padding-bottom:24px; }
#app .al-grid.is-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
#app .al-card { min-height:220px !important; }
</style></head><body data-result="pending"><div id="app" class="animelist-native-view"></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
if(!HTMLElement.prototype.setCssStyles) HTMLElement.prototype.setCssStyles=function(next){Object.assign(this.style,next)};
for(const [name,fn] of Object.entries({
  addClass:function(...names){this.classList.add(...names)},
  removeClass:function(...names){this.classList.remove(...names)},
  toggleClass:function(name,force){this.classList.toggle(name,force)},
})) if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn});
</script>
<script>${bundle}</script><script>
(async()=>{
try {
  const api=AnimeListRefreshStability;
  const app=document.querySelector('#app');
  const frames=(count=2)=>new Promise(resolve=>{let left=count;const step=()=>{left-=1;if(left<=0)resolve();else requestAnimationFrame(step)};requestAnimationFrame(step)});
  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  const items=Array.from({length:19},(_,index)=>({
    title:'Stress Work '+String(index+1).padStart(2,'0'), originalTitle:'', mediaType:index%3===0?'manga':index%3===1?'novel':'anime',
    format:index%3===2?'tv':'', status:'completed', releaseStatus:'finished', progress:index+1, total:index%3===2?24:0,
    unit:index%3===2?'episode':'volume', score:8+(index%3)*0.5, favorite:false, year:2026, genres:[], people:[], platforms:[], sourceUrls:[],
    cover:'', filePath:'AnimeList/work-'+index+'.md', updated:index, updatedLabel:'', startedAt:'2025-01-01',
    completedAt:'2026-08-'+String((index%19)+1).padStart(2,'0'), volumeLog:[],
  }));
  const settings={
    uiState:{section:'library',type:'all',status:'completed',filters:{companies:[],quarter:'',tags:[]},query:'',sort:'completed-desc',view:'grid',layoutColumns:{grid:2,poster:2}},
    timelineMaxStackDepth:4,
  };
  let collectRuns=0;
  let lastCollectType="";
  let libraryRenders=0;
  let asyncRenderId=0;
  let abortedAsyncRenders=0;
  const host={
    settings,
    async saveSettings(){},
    renderLibrary(container,nextItems,adapters={}) {
      libraryRenders+=1;
      api.AnimeListUI.renderLibrary(container,nextItems,{
        ...adapters,
        requiresCompleteDom:()=>true,
        openFilterModal:()=>{},
      });
    },
    collectMediaItems(){ return items.map((item)=>({...item,updatedLabel:'r'+libraryRenders})); },
    updateUiState(next){ Object.assign(settings.uiState,next); },
    workspacePages(){ return [{
      id:'images', label:'Async', icon:'images', order:40,
      async render(container,context) {
        const id=++asyncRenderId;
        await sleep(id===1?220:25);
        if(context.signal.aborted){abortedAsyncRenders+=1;return;}
        container.textContent='async-'+id;
      },
    }]; },
    workspaceMenuActions(){ return []; },
    async openMediaFile(){},
    openAddModal(type){ collectRuns+=1; lastCollectType=type; },
    openEditModal(){},
    async setFavorite(){},
  };
  const view=new api.AnimeListView({contentEl:app,containerEl:app},host);
  await view.onOpen();
  await frames(3);

  const details={};
  const shell=app.querySelector('.al-workspace-shell');
  const nav=app.querySelector('.al-workspace-nav');
  const pageBody=app.querySelector('.al-workspace-page-body');
  const pageActions=app.querySelector('.al-workspace-page-actions');
  const initialDomCount=app.querySelectorAll('*').length;
  const initialCollect=app.querySelector('.al-library-workspace-collect');
  details.initialSingleCollect=app.querySelectorAll('.al-library-workspace-collect').length===1 && pageActions?.childElementCount===1;
  details.longListActuallyScrollable=app.scrollHeight>app.clientHeight*2;

  app.scrollTop=Math.min(app.scrollHeight-app.clientHeight-40,1250);
  let maxScrollDrift=0;
  let maxDomDelta=0;
  let sameShell=true;
  let singleCollect=true;
  let sameCollect=true;
  for(let cycle=0;cycle<18;cycle+=1){
    const desired=Math.min(app.scrollHeight-app.clientHeight-40,app.scrollTop+7+(cycle%3));
    app.scrollTop=desired;
    view.scheduleRender();
    await sleep(135);
    await frames(3);
    maxScrollDrift=Math.max(maxScrollDrift,Math.abs(app.scrollTop-desired));
    maxDomDelta=Math.max(maxDomDelta,Math.abs(app.querySelectorAll('*').length-initialDomCount));
    sameShell &&= app.querySelector('.al-workspace-shell')===shell && app.querySelector('.al-workspace-nav')===nav
      && app.querySelector('.al-workspace-page-body')===pageBody && app.querySelector('.al-workspace-page-actions')===pageActions;
    singleCollect &&= app.querySelectorAll('.al-library-workspace-collect').length===1 && pageActions?.childElementCount===1;
    sameCollect &&= app.querySelector('.al-library-workspace-collect')===initialCollect;
  }
  details.sustainedRefreshPreservesScroll=maxScrollDrift<=1;
  details.sustainedRefreshKeepsOneCollect=singleCollect;
  details.samePageRefreshPreservesSharedDom=sameShell;
  details.collectNodeIdentitySurvivesRefresh=sameCollect;
  details.noLiveDomGrowth=maxDomDelta<=4;
  details.maxScrollDrift=maxScrollDrift;
  details.maxDomDelta=maxDomDelta;

  // A refresh may land while the user is still scrolling. Once reconciliation
  // finishes, the view must not keep restoring an older offset on later frames.
  app.scrollTop=Math.min(app.scrollHeight-app.clientHeight-260,900);
  view.scheduleRender();
  await sleep(112);
  const activeScrollTarget=Math.min(app.scrollHeight-app.clientHeight-40,app.scrollTop+180);
  app.scrollTop=activeScrollTarget;
  await frames(5);
  details.activeScrollIsNotOverridden=Math.abs(app.scrollTop-activeScrollTarget)<=1;

  const beforeBurst=libraryRenders;
  for(let index=0;index<100;index+=1) view.scheduleRender();
  await sleep(150);
  await frames(3);
  details.refreshBurstIsDebounced=libraryRenders===beforeBurst+1;
  details.burstStillHasOneCollect=app.querySelectorAll('.al-library-workspace-collect').length===1;
  details.burstPreservesCollectIdentity=app.querySelector('.al-library-workspace-collect')===initialCollect;
  settings.uiState.type='manga';
  app.querySelector('.al-library-workspace-collect')?.click();
  details.collectClickRunsExactlyOnce=collectRuns===1;
  details.collectUsesLatestState=lastCollectType==='manga';
  settings.uiState.type='all';

  // A slow async page render must not be allowed to overwrite a newer refresh.
  const firstAsync=view.showSection('images');
  await sleep(30);
  view.scheduleRender();
  await sleep(180);
  await firstAsync;
  await sleep(80);
  details.staleAsyncRenderIsAborted=abortedAsyncRenders>=1 && app.querySelector('.al-workspace-page-body')?.textContent==='async-2';

  await view.showSection('library');
  await frames(3);
  details.returnToLibraryHasOneCollect=app.querySelectorAll('.al-library-workspace-collect').length===1;

  // Direct navigation must supersede a queued metadata refresh instead of
  // rendering the newly selected page twice when the old debounce fires.
  const asyncBeforeNavigation=asyncRenderId;
  view.scheduleRender();
  await view.showSection('images');
  await sleep(150);
  details.navigationCancelsQueuedRefresh=asyncRenderId===asyncBeforeNavigation+1;
  await view.showSection('library');
  await frames(3);

  const rendersBeforeClose=libraryRenders;
  view.scheduleRender();
  await view.onClose();
  await sleep(140);
  details.closeCancelsQueuedRefresh=libraryRenders===rendersBeforeClose;

  const pass=Object.entries(details).filter(([key])=>!['maxScrollDrift','maxDomDelta'].includes(key)).every(([,value])=>Boolean(value));
  document.body.dataset.details=JSON.stringify(details);
  document.body.dataset.result=pass?'pass':'fail';
} catch(error) {
  document.body.dataset.details=String(error?.stack||error);
  document.body.dataset.result='fail';
}
})();
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile: desktopProfile,
    testName: "Library sustained refresh stability and Workspace render lifecycle (desktop)",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 900, height: 760, deviceScaleFactor: 1, mobile: false },
    resultTimeoutMs: 12000,
  });
  await runChromiumDatasetTest({
    html: html.replace('<body data-result="pending">', '<body class="is-mobile" data-result="pending">'),
    profile: mobileProfile,
    testName: "Library sustained refresh stability and Workspace render lifecycle (mobile)",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    resultTimeoutMs: 12000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "library-header-layout");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { AnimeListUI } from "./src/ui/library-renderer";
      export { installLibraryLayoutControl } from "./src/ui/library-layout-controls";
      export { installLibraryWorkspaceLayout, renderLibraryWorkspaceActions } from "./src/ui/library-workspace-layout";
      export { renderAnimeListWorkspaceShell } from "./src/ui/workspace-shell";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "workspace-material-layout.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListWorkspaceMaterial",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export class Menu {
            addItem(callback) { callback({ setTitle(){return this}, setIcon(){return this}, onClick(){return this} }); return this; }
            showAtMouseEvent() {}
          }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "workspace-material-layout.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const fixture = () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root {
  --background-primary:#111;
  --background-primary-alt:#181818;
  --background-secondary:#222;
  --background-secondary-alt:#292929;
  --background-modifier-border:#444;
  --background-modifier-hover:#333;
  --interactive-accent:#7867e6;
  --text-normal:#eee;
  --text-muted:#aaa;
  --text-faint:#777;
  --text-on-accent:#fff;
}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}
body{overflow-x:auto}
button,input,select{font:inherit}
${styles}
#root{margin:12px}
</style></head><body data-result="pending"><div id="root" class="animelist-native-view"></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
if(!HTMLElement.prototype.setCssStyles) HTMLElement.prototype.setCssStyles=function(next){Object.assign(this.style,next)};
</script>
<script>${bundle}</script>
<script>
(async()=>{
try {
  const api=AnimeListWorkspaceMaterial;
  const root=document.querySelector('#root');
  const items=Array.from({length:19},(_,index)=>({
    title:'Work '+String(index+1).padStart(2,'0'),originalTitle:'',
    mediaType:index<7?'anime':index<13?'manga':'novel',format:index<7?'tv':index<13?'manga':'novel',
    status:index%4===0?'planned':index%3===0?'completed':'ongoing',releaseStatus:'unknown',
    progress:index+1,total:index<7?12:0,unit:index<7?'episode':'volume',score:null,favorite:false,year:2026,
    genres:[],people:[],platforms:[],sourceUrls:[],cover:'',filePath:'AnimeList/work-'+index+'.md',
    updated:index,updatedLabel:'',startedAt:'',completedAt:'',volumeLog:[],
  }));
  const state={type:'all',status:'all',filters:{companies:[],quarter:'',tags:[]},query:'',sort:'completed-desc',view:'grid',layoutColumns:{grid:5,poster:3}};
  let collectType='';

  function button(label,active=false){
    const el=document.createElement('button'); el.type='button'; el.textContent=label; if(active) el.classList.add('is-active'); return el;
  }
  function renderTimeline(el){
    const rootEl=document.createElement('div'); rootEl.className='al-timeline-root';
    const toolbar=document.createElement('div'); toolbar.className='al-timeline-toolbar';
    const copy=document.createElement('div'); copy.className='al-timeline-copy';
    const title=document.createElement('strong'); title.textContent='時間軸';
    const summary=document.createElement('span'); summary.textContent='19 部作品 · 2025-01-01 — 2026-08-20'; copy.append(title,summary);
    const filters=document.createElement('div'); filters.className='al-timeline-type-filters'; ['全部','動畫','漫畫','小說'].forEach((x,i)=>filters.appendChild(button(x,i===0)));
    const controls=document.createElement('div'); controls.className='al-timeline-controls'; controls.append(button('−'),button('100%'),button('+'));
    toolbar.append(copy,filters,controls); rootEl.appendChild(toolbar); el.appendChild(rootEl);
  }
  function renderScores(el){
    el.classList.add('animelist-score-dashboard-view');
    const shell=document.createElement('section'); shell.className='al-score-dashboard';
    const header=document.createElement('header'); header.className='al-score-dashboard-header';
    const copy=document.createElement('div'); copy.className='al-score-dashboard-copy'; copy.textContent='分數表';
    const summary=document.createElement('div'); summary.className='al-score-dashboard-summary'; summary.textContent='已評分 16 / 19 · 拖曳作品即可調整';
    header.append(copy,summary);
    const controls=document.createElement('div'); controls.className='al-score-dashboard-controls';
    const tabs=document.createElement('nav'); tabs.className='al-score-dashboard-tabs'; ['全部','動畫','漫畫','小說'].forEach((x,i)=>tabs.appendChild(button(x,i===0)));
    const actions=document.createElement('div'); actions.className='al-score-dashboard-action-group'; actions.append(button('未評分'),button('批次'));
    const zoom=document.createElement('label'); zoom.className='al-score-dashboard-zoom'; zoom.textContent='縮放 100%';
    controls.append(tabs,actions,zoom); shell.append(header,controls); el.appendChild(shell);
  }
  function renderImages(el){
    const page=document.createElement('section'); page.className='al-image-gallery-page';
    const header=document.createElement('header'); header.className='al-gallery-page-header';
    const copy=document.createElement('div'); copy.className='al-gallery-page-copy'; copy.textContent='圖庫';
    const summary=document.createElement('div'); summary.className='al-gallery-page-summary'; summary.textContent='86 張圖片 · 19 部作品'; header.append(copy,summary);
    const modes=document.createElement('nav'); modes.className='al-gallery-mode-tabs'; modes.append(button('全部圖片',true),button('依作品'));
    const filters=document.createElement('div'); filters.className='al-gallery-filters';
    const types=document.createElement('div'); types.className='al-gallery-type-filters'; ['全部','動畫','漫畫','小說'].forEach((x,i)=>types.appendChild(button(x,i===0)));
    const search=document.createElement('label'); search.className='al-gallery-search'; search.textContent='搜尋作品';
    const columns=document.createElement('label'); columns.className='al-gallery-columns'; columns.textContent='欄數 4'; filters.append(types,search,columns);
    page.append(header,modes,filters); el.appendChild(page);
  }

  const pages=[
    {id:'library',label:'收藏庫',icon:'library',order:10,render(el,context){
      api.renderLibraryWorkspaceActions(context.pageActions,{currentType:()=>state.type,addItem:(type)=>{collectType=type}});
      api.AnimeListUI.renderLibrary(el,items,{presentation:'workspace',initialState:state,requiresCompleteDom:()=>true,addItem:(type)=>{collectType=type},openFilterModal:()=>{},onStateChange:(next)=>Object.assign(state,next)});
      api.installLibraryLayoutControl(el,{initialState:state,onColumnsChange:()=>{}});
      api.installLibraryWorkspaceLayout(el);
    }},
    {id:'timeline',label:'時間軸',icon:'clock-3',order:20,render:renderTimeline},
    {id:'scores',label:'分數表',icon:'table-properties',order:30,render:renderScores},
    {id:'images',label:'圖庫',icon:'images',order:40,render:renderImages},
  ];
  const labels={library:'收藏庫',timeline:'時間軸',scores:'分數表',images:'圖庫'};
  const sections=['library','timeline','scores','images'];
  const records=[];
  const details={};
  const rect=(el)=>el.getBoundingClientRect();
  const transparent=(value)=>value==='transparent'||value==='rgba(0, 0, 0, 0)';

  for(const section of sections){
    const result=api.renderAnimeListWorkspaceShell(root,{pages,activeSection:section,actions:[{id:'export',label:'匯出',icon:'download',order:10,run(){}}],onSelect(){}});
    result.activePage.render(result.page,{pageActions:result.pageActions,samePageRefresh:false,signal:new AbortController().signal});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const shell=root.querySelector('.al-workspace-shell');
    const appBar=root.querySelector('.al-workspace-header');
    const globalAction=root.querySelector('.al-workspace-action');
    const navRow=root.querySelector('.al-workspace-nav-row');
    const activeTab=root.querySelector('.al-workspace-tab.is-active');
    const pageHeader=root.querySelector('.al-workspace-page-header');
    const pageTitle=root.querySelector('.al-workspace-page-title');
    if(!shell||!appBar||!globalAction||!navRow||!activeTab||!pageHeader||!pageTitle) throw new Error('Missing shared workspace scaffold for '+section);

    const expectedWindowSize=rect(shell).width<600?'compact':rect(shell).width<840?'medium':'expanded';
    records.push({section,height:rect(pageHeader).height,font:getComputedStyle(pageTitle).fontSize});
    details[section+'TitleMatches']=pageTitle.textContent===labels[section];
    details[section+'GlobalActionInAppBar']=globalAction.parentElement?.classList.contains('al-workspace-header-actions')===true && appBar.contains(globalAction);
    details[section+'NavHasNoGlobalAction']=!navRow.contains(globalAction);
    details[section+'WindowSizeUsesLeafWidth']=shell.dataset.windowSize===expectedWindowSize;
    details[section+'PrimaryTabIsFlat']=transparent(getComputedStyle(activeTab).backgroundColor);

    if(section==='library'){
      const collect=root.querySelector('.al-library-workspace-collect');
      const pageActions=root.querySelector('.al-workspace-page-actions');
      const summary=root.querySelector('.al-library-workspace-summary');
      const typeTabs=root.querySelector('.al-library-workspace-type-tabs');
      const toolbar=root.querySelector('.al-library-workspace-toolbar');
      const queryTools=root.querySelector('.al-library-workspace-query-tools');
      const displayTools=root.querySelector('.al-library-workspace-display-tools');
      const status=root.querySelector('.al-status-bar');
      const resultHead=root.querySelector('.al-result-head');
      if(!collect||!pageActions||!summary||!typeTabs||!toolbar||!queryTools||!displayTools||!status||!resultHead) throw new Error('Missing Library Material layout');
      details.collectAttachedToPageTitle=collect.parentElement===pageActions && rect(collect).left-rect(pageTitle).right>=8 && rect(collect).left-rect(pageTitle).right<=24;
      details.libraryHasNoDuplicateTitle=!summary.querySelector('strong');
      const typeButtons=[...typeTabs.querySelectorAll('button')];
      typeButtons[1]?.click(); collect.click();
      details.collectStillUsesSelectedType=collectType==='anime';
      details.mediaTypesAreConnectedSegment=getComputedStyle(typeTabs).gap==='0px' && parseFloat(getComputedStyle(typeTabs).borderRadius)>=18;
      details.toolbarUsesSurface=getComputedStyle(toolbar).backgroundColor!==getComputedStyle(document.body).backgroundColor && parseFloat(getComputedStyle(toolbar).borderRadius)>=14;
      details.statusSeparatedFromToolbar=rect(status).top-rect(toolbar).bottom>=8;
      details.resultsSeparatedFromStatus=rect(resultHead).top-rect(status).bottom>=14;
      const size=shell.dataset.windowSize;
      details.libraryToolbarAdapts=size==='expanded'
        ? Math.abs(rect(queryTools).top-rect(displayTools).top)<=2
        : rect(displayTools).top>=rect(queryTools).bottom-1;
    }
    if(section==='timeline') details.timelineDuplicateTitleHidden=getComputedStyle(root.querySelector('.al-timeline-copy strong')).display==='none';
    if(section==='scores') details.scoresDuplicateTitleHidden=getComputedStyle(root.querySelector('.al-score-dashboard-copy')).display==='none';
    if(section==='images') details.imagesDuplicateTitleHidden=getComputedStyle(root.querySelector('.al-gallery-page-copy')).display==='none';
    details[section+'NoHorizontalOverflow']=document.documentElement.scrollWidth<=document.documentElement.clientWidth+1;
  }

  details.sharedHeaderHeight=records.every((record)=>Math.abs(record.height-records[0].height)<=1);
  details.sharedHeaderTypography=records.every((record)=>record.font===records[0].font);
  details.pageHeadersAreSingleStyle=details.sharedHeaderHeight&&details.sharedHeaderTypography;
  details.geometry=records;
  const pass=Object.entries(details).filter(([key])=>key!=='geometry').every(([,value])=>Boolean(value));
  document.body.dataset.details=JSON.stringify(details);
  document.body.dataset.result=pass?'pass':'fail';
} catch(error) {
  document.body.dataset.details=error?.stack||String(error);
  document.body.dataset.result='fail';
}
})();
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "wide-profile"),
    testName: "Material workspace scaffold wide desktop",
    viewport: { width: 2048, height: 900, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "expanded-profile"),
    testName: "Material workspace scaffold expanded",
    viewport: { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "medium-profile"),
    testName: "Material workspace scaffold medium",
    viewport: { width: 820, height: 900, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html: fixture(),
    profile: path.join(output, "compact-profile"),
    testName: "Material workspace scaffold compact mobile",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "workspace-responsive");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { renderAnimeListWorkspaceShell } from "./src/ui/workspace-shell";
      export { AnimeListUI } from "./src/ui/library-renderer";
      export { installLibraryLayoutControl } from "./src/ui/library-layout-controls";
      export { installLibraryWorkspaceLayout } from "./src/ui/library-workspace-layout";
      export { renderScoreDashboard } from "./src/ui/score-dashboard/renderer";
      export { renderImageGallery, DEFAULT_IMAGE_GALLERY_STATE } from "./src/ui/image-gallery-renderer";
      export { renderTimelineWorkspace } from "./src/ui/timeline-workspace-renderer";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "workspace-responsive.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListWorkspaceResponsive",
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
          export function normalizePath(value) { return String(value || ""); }
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
  readFile(path.join(output, "workspace-responsive.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const pixel = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22960%22%3E%3Crect%20width%3D%22640%22%20height%3D%22960%22%20fill%3D%22%235b5b5b%22%2F%3E%3C%2Fsvg%3E";

function fixture({ leafWidth, expectedSize, dynamic = false }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#181818;--background-secondary:#222;--background-secondary-alt:#292929;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#7867e6;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;--input-shadow:none;}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif;overflow:auto}button,input,select{font:inherit}
${styles}
#leaf{width:${leafWidth}px;max-width:100%;height:760px;margin:0;overflow:hidden;background:#111}
#app{width:100%;height:100%;padding:0}
</style></head><body data-result="pending"><div id="leaf"><main id="app" class="animelist-native-view"></main></div>
<script>
window.addEventListener("error",event=>{const message=String(event.message||event.error||"");if(message.includes("ResizeObserver loop completed with undelivered notifications")){event.preventDefault();return;}document.body.dataset.details=String(event.error?.stack||message);document.body.dataset.result="fail"});
window.addEventListener("unhandledrejection",event=>{document.body.dataset.details=String(event.reason?.stack||event.reason);document.body.dataset.result="fail"});
window.createEl=(tag)=>document.createElement(tag);
if(!Node.prototype.createSvg)Object.defineProperty(Node.prototype,"createSvg",{value:function(tag){const el=document.createElementNS("http://www.w3.org/2000/svg",tag);this.appendChild(el);return el;}});
if(!HTMLElement.prototype.setCssStyles)HTMLElement.prototype.setCssStyles=function(next){Object.assign(this.style,next)};
for(const [name,fn] of Object.entries({addClass:function(...n){this.classList.add(...n)},removeClass:function(...n){this.classList.remove(...n)},toggleClass:function(n,f){this.classList.toggle(n,f)}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}
</script>
<script>${bundle}</script>
<script>
(async()=>{
try{
  const api=AnimeListWorkspaceResponsive;
  const app=document.querySelector('#app');
  const leaf=document.querySelector('#leaf');
  const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const wait=async()=>{await new Promise(resolve=>setTimeout(resolve,35));await frames();};
  const columns=(element)=>getComputedStyle(element).gridTemplateColumns.split(/\\s+/).filter(Boolean).length;
  const noOverflow=(element)=>element.scrollWidth<=element.clientWidth+1;
  const items=Array.from({length:18},(_,index)=>({
    title:'Responsive Work '+String(index+1).padStart(2,'0'),originalTitle:'Original '+index,
    mediaType:index%3===0?'manga':index%3===1?'novel':'anime',format:index%3===2?'tv':'',
    status:index%4===0?'planned':index%3===0?'completed':'ongoing',releaseStatus:'unknown',
    progress:index+1,total:index%3===2?24:0,unit:index%3===2?'episode':'volume',score:8+(index%4)*0.5,
    favorite:index%5===0,year:2026,genres:[],people:[],platforms:[],sourceUrls:[],cover:'${pixel}',
    filePath:'AnimeList/work-'+index+'.md',updated:index,updatedLabel:'',startedAt:'2025-01-01',
    completedAt:'2026-'+String((index%8)+1).padStart(2,'0')+'-'+String((index%20)+1).padStart(2,'0'),volumeLog:[],
  }));
  const state={type:'all',status:'all',filters:{companies:[],quarter:'',tags:[]},query:'',sort:'completed-desc',view:'grid',layoutColumns:{grid:5,poster:5}};
  const galleryImage=(work,index)=>({key:work.sourcePath+'::'+index,path:'img-'+index+'.jpg',sourcePath:work.sourcePath,mediaTitle:work.title,originalTitle:work.originalTitle,mediaType:work.mediaType,references:[{sessionIndex:0,position:index}]});
  const galleryWorks=items.slice(0,5).map((item,index)=>{const base={sourcePath:item.filePath,title:item.title,originalTitle:item.originalTitle,mediaType:item.mediaType};const images=[galleryImage(base,index*2),galleryImage(base,index*2+1)];return {...base,sessions:[{index:0,images}],images};});
  let galleryState={...api.DEFAULT_IMAGE_GALLERY_STATE,columns:4};
  const pages=[
    {id:'library',label:'Library',icon:'library',order:10,render(el){api.AnimeListUI.renderLibrary(el,items,{presentation:'workspace',initialState:state,requiresCompleteDom:()=>true,addItem:()=>{},openFilterModal:()=>{}});api.installLibraryLayoutControl(el,{initialState:state,onColumnsChange:()=>{}});api.installLibraryWorkspaceLayout(el);}},
    {id:'timeline',label:'Timeline',icon:'clock-3',order:20,render(el){api.renderTimelineWorkspace(el,items,{openFile:()=>{}});}},
    {id:'scores',label:'Score Dashboard',icon:'table-properties',order:30,render(el){el.classList.add('animelist-score-dashboard-view');api.renderScoreDashboard(el,items,{type:'all',scale:100,showUnrated:false},{openFile:()=>{},applyChanges:async()=>{},confirmClamp:async()=>true,showNotice:()=>{},onStateChange:()=>{}});}},
    {id:'images',label:'Images',icon:'images',order:40,render(el){api.renderImageGallery(el,galleryWorks,galleryState,{resolve:()=>({resourcePath:'${pixel}'}),openLightbox:()=>{},openSource:()=>{},onStateChange:(next)=>{galleryState={...next}}});}},
  ];
  const details={};
  async function render(section){
    const result=api.renderAnimeListWorkspaceShell(app,{pages,activeSection:section,actions:[{id:'export',label:'Export',icon:'download',order:10,run(){}}],onSelect:()=>{}});
    result.activePage.render(result.page);
    await wait();
    return app.querySelector('.al-workspace-shell');
  }

  let shell=await render('library');
  details.windowSize=shell.dataset.windowSize==='${expectedSize}';
  details.pageFits=noOverflow(app);
  const grid=app.querySelector('.al-grid.is-grid');
  const toolbar=app.querySelector('.al-library-workspace-toolbar');
  const queryTools=app.querySelector('.al-library-workspace-query-tools');
  const displayTools=app.querySelector('.al-library-workspace-display-tools');
  const statuses=app.querySelector('.al-status-bar');
  details.libraryPreferenceSeparated=grid.style.gridTemplateColumns===''&&grid.dataset.layoutColumns==='5'&&grid.style.getPropertyValue('--al-library-preferred-columns')==='5';
  if('${expectedSize}'==='compact'){
    details.libraryEffectiveColumns=columns(grid)===2;
    details.libraryToolbarStacks=displayTools.getBoundingClientRect().top>=queryTools.getBoundingClientRect().bottom-1;
    details.libraryStatusesScroll=getComputedStyle(statuses).flexWrap==='nowrap'&&getComputedStyle(statuses).overflowX==='auto';
    details.libraryTouchTarget=app.querySelector('.al-search').getBoundingClientRect().height>=44;
  }else if('${expectedSize}'==='medium'){
    details.libraryEffectiveColumns=columns(grid)===3;
    details.libraryToolbarStacks=displayTools.getBoundingClientRect().top>=queryTools.getBoundingClientRect().bottom-1;
  }else{
    details.libraryEffectiveColumns=columns(grid)===5;
    details.libraryToolbarStacks=Math.abs(displayTools.getBoundingClientRect().top-queryTools.getBoundingClientRect().top)<=2;
  }
  details.libraryToolbarVisible=toolbar.getBoundingClientRect().height>0;
  details.libraryFits=noOverflow(app);

  shell=await render('scores');
  details.scoresSize=shell.dataset.windowSize==='${expectedSize}';
  const scoreControls=app.querySelector('.al-score-dashboard-controls');
  const scoreGroup=app.querySelector('.al-score-group');
  const scorePosters=app.querySelector('.al-score-lane-posters');
  if('${expectedSize}'==='compact'){
    details.scoreControlsStack=getComputedStyle(scoreControls).display==='grid';
    details.scoreSections=getComputedStyle(scoreGroup).display==='block';
    details.scoreRail=getComputedStyle(scorePosters).flexWrap==='nowrap'&&getComputedStyle(scorePosters).overflowX==='auto';
  }else{
    details.scoreControlsStack=getComputedStyle(scoreControls).display==='flex';
  }
  details.scoresFit=noOverflow(app);

  shell=await render('images');
  details.imagesSize=shell.dataset.windowSize==='${expectedSize}';
  const galleryFilters=app.querySelector('.al-gallery-filters');
  const galleryColumns=app.querySelector('.al-gallery-columns');
  if('${expectedSize}'==='compact'){
    details.imageFiltersStack=columns(galleryFilters)===1;
    details.imageControlsFit=galleryColumns.scrollWidth<=galleryColumns.clientWidth+1;
  }else{
    details.imageFiltersStack=columns(galleryFilters)>=2;
  }
  details.imagesFit=noOverflow(app);

  shell=await render('timeline');
  details.timelineSize=shell.dataset.windowSize==='${expectedSize}';
  const timelineControls=app.querySelector('.al-timeline-workspace-controls');
  const timelineViewport=app.querySelector('.al-timeline-workspace-viewport');
  if('${expectedSize}'==='compact')details.timelineControlsStack=getComputedStyle(timelineControls).flexDirection==='column';
  else if('${expectedSize}'==='medium')details.timelineControlsStack=getComputedStyle(timelineControls).flexWrap==='wrap';
  else details.timelineControlsStack=getComputedStyle(timelineControls).flexDirection==='row';
  details.timelineCanvasVisible=timelineViewport.getBoundingClientRect().height>180;
  details.timelineFits=noOverflow(app);

  if(${dynamic}){
    shell=await render('library');
    const dynamicGrid=app.querySelector('.al-grid.is-grid');
    const sequence=[];
    for(const targetWidth of [599,600,839,840,540]){
      leaf.style.width=targetWidth+'px';
      await wait();
      const measured=shell.getBoundingClientRect().width;
      leaf.style.width=(targetWidth+(targetWidth-measured))+'px';
      await wait();
      sequence.push({size:shell.dataset.windowSize,columns:columns(dynamicGrid),width:Math.round(shell.getBoundingClientRect().width)});
    }
    details.sequence=sequence.map(entry=>entry.size+':'+entry.columns+'@'+entry.width).join(',');
    details.boundaries=sequence.map(entry=>entry.size).join(',')==='compact,medium,medium,expanded,compact';
    details.dynamicColumns=sequence.map(entry=>entry.columns).join(',')==='2,3,3,5,2';
    details.resizeWithoutRerender=app.querySelector('.al-workspace-shell')===shell;
  }

  document.body.dataset.details=JSON.stringify(details);
  document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
}catch(error){document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail';}
})();
</script></body></html>`;
}

const cases = [
  { name: "Workspace compact phone portrait", leafWidth: 390, expectedSize: "compact", viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } },
  { name: "Workspace medium phone landscape", leafWidth: 820, expectedSize: "medium", viewport: { width: 844, height: 390, deviceScaleFactor: 2, mobile: true } },
  { name: "Workspace expanded desktop", leafWidth: 1000, expectedSize: "expanded", viewport: { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false } },
  { name: "Workspace narrow desktop leaf and breakpoint transitions", leafWidth: 540, expectedSize: "compact", dynamic: true, viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } },
];

try {
  for (const testCase of cases) {
    await runChromiumDatasetTest({
      html: fixture(testCase),
      profile: path.join(output, testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
      testName: testCase.name,
      requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
      viewport: testCase.viewport,
    });
  }
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

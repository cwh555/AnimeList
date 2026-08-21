import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "workspace-images");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { renderAnimeListWorkspaceShell } from "./src/ui/workspace-shell";
      export { renderImageGallery, DEFAULT_IMAGE_GALLERY_STATE } from "./src/ui/image-gallery-renderer";
      export { renderTimelineWorkspace } from "./src/ui/timeline-workspace-renderer";
      export { AnimeListUI } from "./src/ui/library-renderer";
      export { installLibraryWorkspaceLayout } from "./src/ui/library-workspace-layout";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "workspace-images.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListWorkspaceImages",
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
          export class MenuItem {
            setTitle(value) { this.title=value; return this; }
            setIcon(value) { this.icon=value; return this; }
            onClick(value) { this.callback=value; return this; }
          }
          export class Menu {
            addItem(callback) { const item=new MenuItem(); callback(item); (window.__menuItems ||= []).push(item.title); return this; }
            showAtMouseEvent() { window.__menuShown=(window.__menuShown||0)+1; return this; }
          }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "workspace-images.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const image = (label, width, height) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#575d75"/><text x="10" y="25" fill="white">${label}</text></svg>`)}`;
const images = {
  a: image("A", 420, 230), b: image("B", 420, 330), c: image("C", 420, 180),
  d: image("D", 420, 280), e: image("E", 420, 220), f: image("F", 420, 360),
};

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#171717;--background-secondary:#202020;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8070df;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;}
html,body{margin:0;width:100%;height:100%;background:#111;color:#eee;font-family:sans-serif}button,input{font:inherit}
/* Approximate Obsidian's normal button constraint. Gallery image/board buttons must explicitly opt out. */
button:not(.clickable-icon){height:32px;background:#292929;box-shadow:0 1px 2px rgba(0,0,0,.35)}
${styles}
</style></head><body class="is-mobile" data-result="pending"><div id="app" class="animelist-native-view"></div>
<script>window.createEl=(tag)=>document.createElement(tag); for(const [name,fn] of Object.entries({addClass:function(...n){this.classList.add(...n)},removeClass:function(...n){this.classList.remove(...n)},toggleClass:function(n,f){this.classList.toggle(n,f)}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}</script>
<script>${bundle}</script><script>
const refs=(sourcePath,title,type,paths,sessions)=>({sourcePath,title,originalTitle:title+" original",mediaType:type,sessions:sessions.map((list,index)=>({index,images:list.map(p=>paths.find(x=>x.path===p))})),images:paths});
const img=(sourcePath,title,type,path,key)=>({key,path,sourcePath,mediaTitle:title,originalTitle:title+" original",mediaType:type,references:[{sessionIndex:0,position:0}]});
const frieren=[img("Anime/Frieren.md","Frieren","anime","a.jpg","f-a"),img("Anime/Frieren.md","Frieren","anime","b.jpg","f-b"),img("Anime/Frieren.md","Frieren","anime","c.jpg","f-c")];
const kaguya=[img("Manga/Kaguya.md","Kaguya","manga","d.jpg","k-d"),img("Manga/Kaguya.md","Kaguya","manga","e.jpg","k-e"),img("Manga/Kaguya.md","Kaguya","manga","f.jpg","k-f")];
frieren[1].references.push({sessionIndex:1,position:0});
const works=[refs("Anime/Frieren.md","Frieren","anime",frieren,[["a.jpg","b.jpg"],["b.jpg","c.jpg"]]),refs("Manga/Kaguya.md","Kaguya","manga",kaguya,[["d.jpg","e.jpg","f.jpg"]])];
const urlMap={"a.jpg":"${images.a}","b.jpg":"${images.b}","c.jpg":"${images.c}","d.jpg":"${images.d}","e.jpg":"${images.e}","f.jpg":"${images.f}"};
const timelineItem={title:"Frieren",originalTitle:"Frieren",mediaType:"anime",format:"TV",status:"completed",releaseStatus:"finished",progress:28,total:28,unit:"ep",score:9,favorite:false,year:2024,genres:[],people:[],platforms:[],sourceUrls:[],cover:"${images.a}",filePath:"Anime/Frieren.md",updated:0,updatedLabel:"",startedAt:"2023-09-29",completedAt:"2024-03-22",volumeLog:[]};
let active="library"; let galleryState={...AnimeListWorkspaceImages.DEFAULT_IMAGE_GALLERY_STATE}; let sourceOpened=""; let lightboxKeys=[]; let collectType="";
const pages=[
 {id:"library",label:"Library",icon:"library",order:10,render(el){AnimeListWorkspaceImages.AnimeListUI.renderLibrary(el,[timelineItem],{presentation:"workspace",addItem:(type)=>{collectType=type}});AnimeListWorkspaceImages.installLibraryWorkspaceLayout(el)}},
 {id:"timeline",label:"Timeline",icon:"clock-3",order:20,render(el){AnimeListWorkspaceImages.renderTimelineWorkspace(el,[timelineItem],{})}},
 {id:"scores",label:"Score Dashboard",icon:"table-properties",order:30,render(el){el.textContent="SCORES PAGE"}},
 {id:"images",label:"Images",icon:"images",order:40,render(el){AnimeListWorkspaceImages.renderImageGallery(el,works,galleryState,{resolve:(image)=>({resourcePath:urlMap[image.path]}),openLightbox:(imgs,start)=>{lightboxKeys=imgs.map(i=>i.key).slice(start)},openSource:(path)=>{sourceOpened=path},onStateChange:(state)=>{galleryState={...state}}})}},
];
const app=document.querySelector("#app");
const render=()=>{const result=AnimeListWorkspaceImages.renderAnimeListWorkspaceShell(app,{pages,activeSection:active,actions:[{id:"updates",label:"Release updates",icon:"refresh-cw",order:10,run(){window.__workspaceActionRuns=(window.__workspaceActionRuns||0)+1}}],onSelect:(section)=>{active=section;render()}}); result.activePage.render(result.page);};
const tab=(section)=>document.querySelector('.al-workspace-tab[data-section="'+section+'"]');
const click=(el)=>el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
render();
(async()=>{
 const details={};
 const topTabs=[...document.querySelectorAll('.al-workspace-tab')];
 details.topLevelOrder=topTabs.map(x=>x.dataset.section).join(',')==='library,timeline,scores,images';
 details.subtitleRemoved=!document.querySelector('.al-workspace-subtitle');
 const inactiveStyle=getComputedStyle(tab('timeline'));
 details.primaryNavIsFlat=inactiveStyle.boxShadow==='none' && inactiveStyle.backgroundColor==='rgba(0, 0, 0, 0)';
 details.primaryNavVisibleOnMobile=getComputedStyle(document.querySelector('.al-workspace-nav')).display!=='none';
 const primaryNav=document.querySelector('.al-workspace-nav');
 details.primaryNavHasNoVerticalScrollbar=primaryNav.scrollHeight<=primaryNav.clientHeight && !['auto','scroll'].includes(getComputedStyle(primaryNav).overflowY);
 const librarySummary=document.querySelector('.al-library-workspace-summary');
 const pageActions=document.querySelector('.al-workspace-page-actions');
 const typeTabs=document.querySelector('.al-library-workspace-type-tabs');
 const libraryCollect=document.querySelector('.al-library-workspace-collect');
 details.collectAttachedToSharedPageHeader=!!librarySummary && !!pageActions && libraryCollect?.parentElement===pageActions && typeTabs?.parentElement===document.querySelector('.al-shell.is-workspace-page') && !document.querySelector('.al-library-workspace-type-row') && !document.querySelector('.al-workspace-collect');
 click(libraryCollect);
 details.collectUsesCurrentLibraryType=collectType==='anime';
 const directAction=document.querySelector('.al-workspace-action');
 details.singleWorkspaceActionIsDirect=!!directAction && directAction.textContent.includes('Release updates') && !document.querySelector('.al-workspace-more');
 click(directAction);
 details.directWorkspaceActionRuns=window.__workspaceActionRuns===1;

 click(tab('timeline')); await new Promise(r=>setTimeout(r,25)); await frames();
 const timelineViewport=document.querySelector('.al-timeline-viewport');
 const timelineCard=document.querySelector('.al-timeline-card');
 const timelineImage=timelineCard?.querySelector('img');
 const timelineCopy=timelineCard?.querySelector('.al-timeline-card-copy');
 const timelineShade=timelineCard?.querySelector('.al-cover-shade');
 details.timelineRendersInWorkspace=document.querySelectorAll('.al-timeline-card').length===1 && timelineViewport.getBoundingClientRect().height>240;
 if(!timelineCard||!timelineImage||!timelineCopy||!timelineShade) throw new Error('Missing compact Timeline card parts');
 const timelineCardRect=timelineCard.getBoundingClientRect();
 const timelineImageRect=timelineImage.getBoundingClientRect();
 const timelineCopyRect=timelineCopy.getBoundingClientRect();
 details.timelineCardUsesCompactOverlay=timelineCardRect.height>=178 && timelineCardRect.height<=182
   && Math.abs(timelineImageRect.height-timelineCardRect.height)<=2
   && getComputedStyle(timelineCopy).position==='absolute'
   && Math.abs(timelineCopyRect.bottom-timelineCardRect.bottom)<=12
   && !timelineCopy.querySelector('small');

 click(tab('images')); await new Promise(r=>setTimeout(r,20)); await frames();
 details.sameWorkspaceSwitch=active==='images' && !!document.querySelector('.al-workspace-shell .al-image-gallery-page');
 const modeTabs=document.querySelector('.al-gallery-mode-tabs');
 const modeButton=document.querySelector('.al-gallery-mode-tab');
 details.secondaryNavDistinct=!!modeTabs && !modeButton.classList.contains('al-workspace-tab') && parseFloat(getComputedStyle(modeTabs).borderRadius)>=8;

 const slider=document.querySelector('.al-gallery-columns input');
 slider.value='2'; slider.dispatchEvent(new Event('input',{bubbles:true})); await frames();
 const imageButton=document.querySelector('.al-gallery-image-open');
 const imageElement=document.querySelector('.al-gallery-image');
 const imageButtonRect=imageButton.getBoundingClientRect(); const imageRect=imageElement.getBoundingClientRect();
 details.galleryImagesUseIntrinsicHeight=imageButtonRect.height>70 && imageRect.height>70 && Math.abs(imageButtonRect.height-imageRect.height)<2;

 slider.value='5'; slider.dispatchEvent(new Event('input',{bubbles:true})); await frames();
 details.exactFiveColumns=document.querySelectorAll('.al-gallery-masonry-column').length===5 && getComputedStyle(document.querySelector('.al-gallery-masonry')).gridTemplateColumns.split(' ').filter(Boolean).length===5;
 const typeButtons=[...document.querySelectorAll('.al-gallery-type-filter')]; click(typeButtons[1]); await new Promise(r=>setTimeout(r,10));
 details.typeFilterReducesGallery=document.querySelectorAll('.al-gallery-image-tile').length===3;
 click(document.querySelectorAll('.al-gallery-mode-tab')[1]); await new Promise(r=>setTimeout(r,10)); await frames();
 details.byWorkShowsOneFilteredBoard=document.querySelectorAll('.al-gallery-work-card').length===1;
 details.workBoardsAreExpanded=document.querySelector('.al-gallery-work-card').getBoundingClientRect().height>120;
 click(document.querySelector('.al-gallery-work-card')); await new Promise(r=>setTimeout(r,10));
 details.workDetailHasSessions=document.querySelectorAll('.al-gallery-session-filter').length===3;
 const sessionButtons=[...document.querySelectorAll('.al-gallery-session-filter')]; click(sessionButtons[2]); await new Promise(r=>setTimeout(r,10));
 details.sessionFilterUsesSessionImages=document.querySelectorAll('.al-gallery-image-tile').length===2;
 click(document.querySelector('.al-gallery-source-button'));
 details.sourceRouteUsesOwningNote=sourceOpened==='Anime/Frieren.md';
 click(document.querySelector('.al-gallery-image-open'));
 details.lightboxUsesFilteredOrder=lightboxKeys.length===2;
 document.body.dataset.details=JSON.stringify(details); document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
})().catch(error=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "AnimeList workspace navigation, Timeline, and Images gallery",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "characters-ui");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { renderCharacterPage } from "./src/ui/characters/character-page"; export { TFile } from "obsidian";',
      resolveDir: root, loader: "ts",
    },
    outfile: path.join(output, "characters.js"),
    bundle: true, platform: "browser", format: "iife",
    globalName: "CharactersFixture", target: "es2022",
    plugins: [{
      name: "obsidian-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: [
            'export class TFile { constructor(path=""){ this.path=path;this.name=path.split("/").pop();this.basename=this.name.replace(/\\.md$/,"");this.extension=path.endsWith(".md")?"md":"png";this.stat={ctime:1,mtime:1,size:100}; } }',
            'export class Modal { constructor(app){this.app=app;this.modalEl=document.createElement("div");this.modalEl.className="modal";this.contentEl=document.createElement("div");this.contentEl.className="modal-content";this.modalEl.append(this.contentEl);} open(){document.body.append(this.modalEl);this.onOpen?.();} close(){this.onClose?.();this.modalEl.remove();} }',
            'export class Notice { constructor(message){ (window.__notices ||= []).push(message); } }',
            'export function normalizePath(path){return String(path || "");}',
            'export function requestUrl(){return Promise.reject(new Error("No network fixture"));}',
            'export function setIcon(element,name){element.dataset.icon=name;}',
          ].join("\n"),
        }));
      },
    }],
  });
  const [bundle, css] = await Promise.all([
    readFile(path.join(output, "characters.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const js = [
    'window.createEl=(tag)=>document.createElement(tag);',
    'for(const [name,fn] of Object.entries({addClass:function(...names){this.classList.add(...names)},removeClass:function(...names){this.classList.remove(...names)},empty:function(){this.replaceChildren()}})){if(!HTMLElement.prototype[name])Object.defineProperty(HTMLElement.prototype,name,{value:fn});}',
    'window.addEventListener("error",event=>{document.body.dataset.details=String(event.error?.stack||event.message);document.body.dataset.result="fail"});',
    'window.addEventListener("unhandledrejection",event=>{document.body.dataset.details=String(event.reason?.stack||event.reason);document.body.dataset.result="fail"});',
    'const pixel="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22600%22%20height=%22800%22%3E%3Crect%20width=%22600%22%20height=%22800%22%20fill=%22%23667491%22/%3E%3C/svg%3E";',
    'const chars=Array.from({length:3},(_,i)=>({id:"c"+i,path:"AnimeList/Characters/c"+i+".md",name:"Character "+i,tier:i===0?"top":"liked",bangumiId:String(i+1),portrait:"Assets/a.png",appearances:[]}));',
    'const resources=new Map(chars.map(c=>[c.path,new CharactersFixture.TFile(c.path)]));resources.set("Assets/a.png",new CharactersFixture.TFile("Assets/a.png"));',
    'const srcText=[String.fromCharCode(96).repeat(3)+"animelist-images","- Assets/a.png",String.fromCharCode(96).repeat(3)].join("\\n");',
    'const app={vault:{configDir:".obsidian",getAbstractFileByPath:p=>resources.get(p)??null,cachedRead:async()=>srcText,getResourcePath:()=>pixel,adapter:{exists:async()=>false,readBinary:async()=>new ArrayBuffer(0),writeBinary:async()=>{}}},metadataCache:{getFileCache:()=>({frontmatter:{}}),getFirstLinkpathDest:p=>resources.get(p)??null}};',
    'const service={list:async()=>chars,setTier:async()=>{},setPortrait:async()=>{},setName:async()=>{},attachImage:async()=>true};',
    'const host={app,settings:{libraryRoot:"AnimeList",coverFolder:"AnimeList/Covers"},getImageThumbnailSources:()=>undefined,collectMediaItems:()=>[],openMediaFile:async()=>{},refreshViews:()=>{},openLibrarySection:async()=>{},ensureFolder:async()=>{},uniqueFilePath:async()=>""};',
    'const root=document.querySelector("#root");const actions=document.querySelector("#actions");',
    'const context={pageActions:actions,samePageRefresh:false,signal:new AbortController().signal};',
    'const delay=()=>new Promise(r=>setTimeout(r,100));const checks={};',
    '(async()=>{',
    'await CharactersFixture.renderCharacterPage(host,service,root,context);await delay();',
    'checks.libraryCardCount=root.querySelectorAll(".al-character-card").length===3;',
    'checks.libraryCardHasPortrait=!!root.querySelector(".al-character-card .al-character-cover img");',
    'checks.noHorizontalOverflow=root.scrollWidth<=root.clientWidth+2;',
    'root.querySelector(".al-character-card").click();await delay();',
    'checks.detailOpens=root.querySelector(".al-character-details h2")?.textContent==="Character 0";',
    'checks.characterImageAvailable=root.querySelectorAll(".al-character-image-open img").length===1;',
    'root.querySelector(".al-character-details button").click();await delay();',
    'checks.backToCards=root.querySelectorAll(".al-character-card").length===3;',
    'root.querySelectorAll(".al-character-mode-tabs button")[1].click();await delay();',
    'checks.crossCharacterGallery=root.querySelectorAll(".al-gallery-image-tile").length===3;',
    'checks.noIrrelevantMediaFilter=getComputedStyle(root.querySelector(".al-gallery-type-filters")).display==="none";',
    'root.querySelectorAll(".al-character-mode-tabs button")[2].click();await delay();',
    'checks.rankingShowsAll=root.querySelectorAll(".al-character-ranking-row").length===3;',
    'checks.rankingRange=root.querySelector(".al-character-rank")?.textContent==="#1–3";',
    'root.querySelector(".al-character-ranking-actions button").click();await delay();',
    'checks.rankingOffersTwoChoices=document.querySelectorAll(".al-character-compare-choice").length===2;',
    'document.querySelector(".al-character-compare-choice").click();await delay();',
    'checks.rankingAnswerHandled=!window.__notices?.length;',
    'document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"});',
  ].join("\n");
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
    + ':root{--background-primary:#111;--background-primary-alt:#161616;--background-secondary:#222;--background-secondary-alt:#292929;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--interactive-accent:#8275d9;--text-on-accent:white}*{box-sizing:border-box}body{margin:0;color:#eee;background:#111;font-family:sans-serif}input,button{font:inherit}'
    + css + '</style></head><body data-result="pending"><div id="actions"></div><main id="root" class="animelist-native-view"></main><script>'
    + bundle + '</script><script>' + js + '</script></body></html>';
  await runChromiumDatasetTest({
    html, profile: path.join(output, "profile"),
    testName: "AnimeList Characters card, gallery and pairwise-ranking interaction",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

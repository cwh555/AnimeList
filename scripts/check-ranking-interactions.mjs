import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "ranking-interactions");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { renderRankingPanel } from "./src/ui/pairwise-ranking/panel";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "ranking.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    globalName: "AnimeListRanking",
    target: "es2022",
    logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: 'export function setIcon() {} export class Menu {addItem(){return this;} showAtPosition(){}} export class Modal {constructor(){this.contentEl=document.createElement("div");} open(){} close(){}}',
        }));
      },
    }],
  });
  const [bundle, styles] = await Promise.all([
    readFile(path.join(output, "ranking.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const html = [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>:root{--background-primary:#161616;--background-secondary:#222;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--text-warning:#edc66c;--interactive-accent:#868aff;--radius-m:8px;--radius-s:4px;--radius-l:10px;--font-ui-small:13px}*{box-sizing:border-box}body{margin:0;background:#111;color:#eee;font-family:sans-serif}#root{padding:8px;width:100%;max-width:100%;}'+styles+'</style>',
    '</head><body data-result="pending"><div id="root" class="al-workspace-page-body"></div>',
    '<script>window.createEl=(tag)=>document.createElement(tag);window.createDiv=()=>document.createElement("div");</script>',
    '<script>'+bundle+'</script><script>',
    '(async()=>{',
    'const delay=()=>new Promise(resolve=>setTimeout(resolve,120));',
    'const note=(title,type="anime",status="completed")=>({title,mediaType:type,status,filePath:type+"/"+title+".md",cover:"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22150%22%3E%3Crect%20width=%22100%22%20height=%22150%22%20fill=%22%23777%22/%3E%3C/svg%3E"});',
    'const items=[note("A"),note("B"),note("C"),note("M","manga"),note("Excluded","anime","ongoing")];',
    'const empty=()=>({ordered:[],pending:{},active:null,history:[]});',
    'let data={version:1,anime:empty(),manga:empty(),novel:empty()};',
    'const store={mutate:async(fn)=>{const next=structuredClone(data);fn(next);data=next;return data;}};',
    'const root=document.querySelector("#root");',
    'let comparing=false;let currentType="anime";const checks={};',
    'const redraw=()=>AnimeListRanking.renderRankingPanel(root,opts);',
    'const opts={app:{},store,items,type:currentType,comparing,setComparing(v){comparing=v;opts.comparing=v;},setType(v){currentType=v;opts.type=v;comparing=false;opts.comparing=false;redraw();},redraw,openNote:async()=>{},showNotice:(message)=>{throw Error(message);}};',
    'await redraw();',
    'checks.typeSeparate=root.querySelectorAll(".al-ranking-type-tabs button").length===3 && !root.textContent.includes("Excluded");',
    'root.querySelector(".al-ranking-actions button").click();await delay();',
    'checks.coverSelect=!!root.querySelectorAll(".al-ranking-choice").length && !root.querySelector(".al-ranking-choice").textContent.includes("選左邊");',
    'root.querySelector(".al-ranking-choice").click();await delay();',
    'checks.rankAfterChoice=data.anime.ordered.length===2;',
    'for(let i=0;i<5&&root.querySelector(".al-ranking-choice");i++){root.querySelector(".al-ranking-skip").click();await delay();}',
    'checks.skipPending=Object.keys(data.anime.pending).length===1 && data.anime.ordered.length===2;',
    'if(root.querySelector(".al-ranking-actions button")){}',
    'data.anime.ordered=["anime/A.md","anime/B.md","anime/C.md"];data.anime.pending={};data.anime.active=null;comparing=false;opts.comparing=false;await redraw();',
    'checks.listCovers=root.querySelectorAll(".al-ranking-row img").length===3 && root.querySelectorAll(".al-ranking-handle").length===3;',
    'const grip=root.querySelector(".al-ranking-handle");',
    'grip.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}));await delay();',
    'checks.keyboardMove=data.anime.ordered[1]==="anime/A.md" && data.anime.ordered[0]==="anime/B.md";',
    'checks.noScoreMutation=items.every(x=>x.score===undefined);',
    'checks.touchHandleOnly=getComputedStyle(root.querySelector(".al-ranking-handle")).touchAction==="none" && getComputedStyle(root.querySelector(".al-ranking-open")).touchAction!=="none";',
    'checks.noOverflow=document.documentElement.scrollWidth<=innerWidth+1 && root.scrollWidth<=innerWidth+1;',
    'document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});',
    '</script></body></html>',
  ].join("\n");
  for (const viewport of [
    { width: 320, height: 720, deviceScaleFactor: 2, mobile: true },
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false },
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, "profile-" + viewport.width),
      viewport,
      testName: "Ranking interaction " + viewport.width + "px",
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

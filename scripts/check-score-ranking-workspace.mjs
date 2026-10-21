import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "score-ranking-workspace");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { scoreDashboardFeature } from "./src/features/score-dashboard/feature";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "AnimeListScoreRanking",
    target: "es2022",
    logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: 'export class ItemView {constructor(){this.contentEl=document.createElement("div")}} export class TAbstractFile{} export class TFile extends TAbstractFile{} export class Notice{} export class Menu{addItem(){return this}showAtPosition(){}} export class Modal{constructor(){this.contentEl=document.createElement("div")}open(){}close(){}} export function setIcon(){} export function normalizePath(x){return x}',
        }));
      },
    }],
  });
  const [bundle, styles] = await Promise.all([
    readFile(path.join(output, "bundle.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const html = [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>:root{--background-primary:#161616;--background-secondary:#222;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--interactive-accent:#868aff;--radius-m:8px;--radius-s:4px;--font-ui-small:13px}body{margin:0;background:#111;color:#eee;font-family:sans-serif}.al-workspace-page-body{height:700px;overflow:auto;padding:6px}'+styles+'</style>',
    '</head><body data-result="pending"><div class="al-workspace-shell"><div id="root" class="al-workspace-page-body"></div></div>',
    '<script>window.createEl=(tag)=>document.createElement(tag);window.createDiv=()=>document.createElement("div");HTMLElement.prototype.addClass=function(name){this.classList.add(name)};HTMLElement.prototype.removeClass=function(name){this.classList.remove(name)};</script>',
    '<script>'+bundle+'</script><script>',
    '(async()=>{',
    'const delay=()=>new Promise(resolve=>setTimeout(resolve,160));',
    'const svg="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2260%22/%3E";',
    'const items=Array.from({length:14},(_,i)=>({title:"Work "+i,mediaType:"anime",status:"completed",score:7.5,cover:svg,filePath:"AnimeList/Anime/Work"+i+".md",updated:0,updatedLabel:"",genres:[],people:[],volumeLog:[]}));',
    'const host={app:{vault:{configDir:".obsidian",adapter:{exists:async()=>false},on:()=>({})},metadataCache:{on:()=>({})},workspace:{getLeavesOfType:()=>[]}},settings:{coverFolder:"AnimeList/Covers"},registerView:()=>{},addCommand:()=>{},registerEvent:()=>{},registerDomEvent:()=>{},getScanFolders:()=>["AnimeList"],collectMediaItems:()=>items,openMediaFile:async()=>{},openLibrarySection:async()=>{},refreshViews:()=>{}};',
    'const feature=AnimeListScoreRanking.scoreDashboardFeature;',
    'const lifecycle=feature.contributions.find(x=>x.kind==="lifecycle");',
    'lifecycle.activate(host);',
    'const page=feature.contributions.find(x=>x.kind==="workspace-page").page(host);',
    'const root=document.querySelector("#root");',
    'page.render(root);await delay();',
    'const checks={};',
    'checks.ratingVisible=root.querySelectorAll(".al-score-poster").length===14;',
    'checks.originalScrollHost=!!root.querySelector(":scope > .al-score-dashboard") && root.scrollHeight>root.clientHeight;',
    'const tabs=root.querySelectorAll(".al-ranking-mode-tabs button");',
    'checks.twoModes=tabs.length===2 && tabs[0].textContent==="評分" && tabs[1].textContent==="排名";',
    'tabs[1].click();await delay();',
    'checks.rankingInsideScores=root.querySelectorAll(".al-ranking-type-tabs button").length===3 && !root.querySelector(".al-score-dashboard");',
    'root.querySelector(".al-ranking-mode-tabs button").click();await delay();',
    'checks.ratingRestored=root.querySelectorAll(".al-score-poster").length===14 && !!root.querySelector(":scope > .al-score-dashboard");',
    'checks.noScoreMutation=items.every(x=>x.score===7.5);',
    'checks.noOverflow=document.documentElement.scrollWidth<=innerWidth+1;',
    'document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});',
    '</script></body></html>',
  ].join("\n");
  for (const viewport of [
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false },
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, "profile-" + viewport.width),
      viewport,
      testName: "Score/ranking workspace integration " + viewport.width + "px",
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

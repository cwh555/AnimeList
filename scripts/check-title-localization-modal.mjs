import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "title-localization-browser");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { TitleLocalizationModal } from "./src/ui/title-localization-modal"; export { setActiveLocale } from "./src/i18n/catalog"; export { TFile } from "obsidian";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "bundle.js"),
    bundle: true, platform: "browser", format: "iife", globalName: "TitleLocalization",
    target: "es2022", logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: [
            'export class TFile { constructor(){this.path="";this.basename="";this.extension="md";this.stat={mtime:10};} }',
            'export class Modal { constructor(app){this.app=app;this.modalEl=document.createElement("div");this.modalEl.className="modal";this.titleEl=document.createElement("h2");this.contentEl=document.createElement("div");this.contentEl.className="modal-content";this.modalEl.append(this.titleEl,this.contentEl);} open(){document.body.append(this.modalEl);this.onOpen?.()} close(){this.onClose?.();this.modalEl.remove()}}',
            'export class Notice { constructor(message){globalThis.__notices.push(message)} }',
            'export function normalizePath(value){return String(value||"")}',
            'export function setIcon() {}',
            'export async function requestUrl(options){return globalThis.__mockRequestUrl(options)}',
          ].join("\n"),
        }));
      },
    }],
  });
  const [bundle, styles] = await Promise.all([
    readFile(path.join(output, "bundle.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const setup = [
    'HTMLElement.prototype.empty=function(){this.replaceChildren()}',
    'HTMLElement.prototype.addClass=function(...names){this.classList.add(...names)}',
    'HTMLElement.prototype.setText=function(text){this.textContent=text}',
    'HTMLElement.prototype.createEl=function(tag,opts){const el=document.createElement(tag);if(opts){if(opts.text!==undefined)el.textContent=opts.text;if(opts.cls)el.className=opts.cls;if(opts.type)el.type=opts.type;if(opts.value)el.value=opts.value;}this.appendChild(el);return el}',
    'HTMLElement.prototype.createDiv=function(opts){return this.createEl("div",opts)}',
    'HTMLElement.prototype.createSpan=function(opts){return this.createEl("span",opts)}',
    'window.__notices=[]',
    'window.__mockRequestUrl=async opts=>{if(!opts.url.includes("/v0/subjects/88"))throw Error("Unexpected URL "+opts.url);return {json:{id:88,name:"日本語原題",name_cn:"简体标题",infobox:[],date:"2021-01-01"}}}',
    '(async()=>{',
    '  const notes=[{media_type:"anime",title:"日本語原題",source_provider:"bangumi",source_id:"88",title_original:"日本語原題",tags:["mine"],other_field:"keep"},{media_type:"novel",title:"Custom novel",other_field:"untouched"}];',
    '  const files=notes.map((n,i)=>{const f=new TitleLocalization.TFile();f.path="AnimeList/"+i+".md";f.basename="Note"+i;return f});',
    '  const cache=new Map(files.map((f,i)=>[f.path,notes[i]]));',
    '  const app={vault:{getRoot(){return {children:files}},getAbstractFileByPath(p){return files.find(f=>f.path===p)??null}},metadataCache:{getFileCache(f){return {frontmatter:cache.get(f.path)}}},fileManager:{async processFrontMatter(f,cb){cb(cache.get(f.path))}}};',
    '  let refreshed=0;TitleLocalization.setActiveLocale("zh-TW");',
    '  const modal=new TitleLocalization.TitleLocalizationModal({app,getScanFolders(){return [""]},refreshViews(){refreshed++}});',
    '  const checks={};modal.open();const root=document.querySelector(".al-title-localization-modal");',
    '  checks.englishTitle=root.querySelector("h2").textContent==="Update existing media titles";',
    '  checks.englishLabels=root.textContent.includes("Target language")&&root.textContent.includes("Scan and preview")&&!root.textContent.includes("預覽名稱更新");',
    '  const select=root.querySelector("select");select.value="zh-CN";',
    '  [...root.querySelectorAll("button")].find(x=>x.textContent==="Scan and preview").click();',
    '  for(let i=0;i<60&&!root.textContent.includes("Scanned 2");i++)await new Promise(resolve=>setTimeout(resolve,25));',
    '  checks.scanReview=root.textContent.includes("scanned")&&root.textContent.includes("unchanged/unavailable")&&root.textContent.includes("ready:")&&!root.textContent.includes("no-source");',
    '  checks.workRows=root.querySelectorAll(".al-version-cleanup-item").length===1;',
    '  checks.onlyProposed=root.textContent.includes("日本語原題 → 简体标题")&&!root.textContent.includes("Custom novel");
  checks.noWritesBeforeConfirm=notes[0].title==="日本語原題"&&notes[1].title==="Custom novel";',
    '  checks.sourceLink=!!root.querySelector("a[href=\\"https://bgm.tv/subject/88\\"]");',
    '  const confirm=[...root.querySelectorAll("button")].find(x=>x.textContent==="Update selected titles");',
    '  checks.explicitApply=!!confirm&&!confirm.disabled;confirm?.click();',
    '  for(let i=0;i<30&&!root.textContent.includes("Updated 1");i++)await new Promise(resolve=>setTimeout(resolve,20));',
    '  checks.applied=notes[0].title==="简体标题"&&notes[0].title_original==="日本語原題"&&notes[0].other_field==="keep"&&notes[1].title==="Custom novel"&&refreshed===1;',
    '  checks.history=notes[0].title_aliases?.includes("日本語原題")&&notes[0].tags[0]==="mine";',
    '  checks.noOverflow=root.getBoundingClientRect().right<=innerWidth+1&&root.getBoundingClientRect().left>=-1;',
    '  document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"})',
  ].join("\n");
  const html = [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>:root{--background-primary:#171717;--background-secondary:#222;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--interactive-accent:#8263e8}*{box-sizing:border-box}body{font:14px sans-serif;background:#171717;color:#eee;margin:0}.modal{position:relative;max-width:min(650px,94vw);max-height:90vh;overflow:auto;margin:3vh auto;padding:12px;background:#252525;border-radius:12px}'+styles+'</style>',
    '</head><body data-result="pending"><script>',bundle,'</script><script>',setup,'</script></body></html>',
  ].join("");
  for (const viewport of [{width:390,height:844,deviceScaleFactor:2,mobile:true},{width:1280,height:800,deviceScaleFactor:1,mobile:false}]) {
    await runChromiumDatasetTest({
      html, profile: path.join(output, "profile-"+viewport.width), viewport,
      resultTimeoutMs:6000, testName:"Title migration Settings "+viewport.width+"px",
    });
  }
} finally {
  stop();
  await rm(output,{recursive:true,force:true});
}

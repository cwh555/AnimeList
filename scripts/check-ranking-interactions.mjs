import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "ranking-interactions");
const screenshots = path.join(root, ".tmp", "ranking-ui-screenshots");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await rm(screenshots, { recursive: true, force: true });
await mkdir(screenshots, { recursive: true });
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
          contents: 'export function setIcon() {} export class Menu {addItem(){return this;} showAtPosition(){}} export class Modal {constructor(){this.modalEl=document.createElement("div");this.modalEl.className="modal";this.contentEl=document.createElement("div");this.contentEl.className="modal-content";this.modalEl.append(this.contentEl);} open(){document.body.append(this.modalEl);this.onOpen?.()} close(){this.onClose?.();this.modalEl.remove()}}',
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
    '<script>window.createEl=(tag)=>document.createElement(tag);window.createDiv=()=>document.createElement("div");HTMLElement.prototype.addClass=function(...names){this.classList.add(...names)};HTMLElement.prototype.empty=function(){this.replaceChildren()};HTMLElement.prototype.createEl=function(tag,options){const el=document.createElement(tag);if(options?.text)el.textContent=options.text;this.append(el);return el};</script>',
    '<script>'+bundle+'</script><script>',
    '(async()=>{',
    'const delay=()=>new Promise(resolve=>setTimeout(resolve,120));',
    'const note=(title,type="anime",status="completed")=>({title,mediaType:type,status,filePath:type+"/"+title+".md",cover:"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22150%22%3E%3Crect%20width=%22100%22%20height=%22150%22%20fill=%22%23777%22/%3E%3C/svg%3E"});',
    'const longTitle="輝夜姬想讓人告白～天才們的戀愛頭腦戰～特別篇 超級長的副標題無法全部顯示時應截斷 1234567890abcdef";',
    'const items=[note("A"),note("B"),note("C"),note(longTitle),note("M","manga"),note("Excluded","anime","ongoing")];',
    'const empty=()=>({ordered:[],pending:{},active:null,history:[]});',
    'let data={version:1,anime:empty(),manga:empty(),novel:empty()};',
    'const store={load:async()=>data,mutate:async(fn)=>{const next=structuredClone(data);fn(next);data=next;return data;}};',
    'const root=document.querySelector("#root");',
    'let currentType="anime";const checks={};',
    'const redraw=()=>AnimeListRanking.renderRankingPanel(root,opts);',
    'const opts={app:{},store,items,type:currentType,setType(v){currentType=v;opts.type=v;redraw();},redraw,openNote:async()=>{},showNotice:(message)=>{throw Error(message);}};',
    'await redraw();',
    'checks.typeSeparate=root.querySelectorAll(".al-ranking-type-tabs button").length===3 && !root.textContent.includes("Excluded");',
    'root.querySelector(".al-ranking-actions button").click();await delay();',
    'let modal=document.querySelector(".al-ranking-comparison-modal");',
    'checks.modalOpened=!!modal && root.querySelector(".al-ranking-choice")===null && modal.querySelectorAll(".al-ranking-choice").length===2;',
    'checks.coverSelect=modal.querySelectorAll(".al-ranking-choice-cover img").length===2 && modal.querySelector(".al-ranking-dialog-title")?.textContent==="第 1 輪";',
    'checks.hasRounds=data.anime.round?.stage===1 && data.anime.round?.jobs.length===2;',
    'checks.modalFits=modal.getBoundingClientRect().left>=-1 && modal.getBoundingClientRect().right<=innerWidth+1 && modal.getBoundingClientRect().height<=innerHeight+1;',
    'modal.querySelector(".al-ranking-choice").click();await delay();',
    'checks.roundCompared=data.anime.round?.comparisons===1 && data.anime.ordered.length===0;',
    'modal=document.querySelector(".al-ranking-comparison-modal");',
    'modal.querySelector(".al-ranking-dialog-action:last-child").click();await delay();',
    'checks.pauseClosesModal=!document.querySelector(".al-ranking-comparison-modal") && !!root.querySelector(".al-ranking-list");',
    'root.querySelector(".al-ranking-actions button").click();await delay();',
    'modal=document.querySelector(".al-ranking-comparison-modal");',
    'checks.resumeOpensModal=!!modal;',
    'for(let i=0;i<25&&document.querySelector(".al-ranking-comparison-modal");i++){document.querySelector(".al-ranking-comparison-modal .al-ranking-skip").click();await delay();}',
    'checks.skipPending=Object.keys(data.anime.pending).length>=1 && !data.anime.round && !document.querySelector(".al-ranking-comparison-modal");',
    'data.anime.ordered=["anime/A.md","anime/B.md","anime/C.md"];data.anime.pending={};data.anime.round=null;data.anime.active={path:"anime/"+longTitle+".md",comparisons:{}};await redraw();',
    'root.querySelector(".al-ranking-actions button").click();await delay();',
    'modal=document.querySelector(".al-ranking-comparison-modal");',
    'const longCard=[...modal.querySelectorAll(".al-ranking-choice")].find(card=>card.title===longTitle);',
    'const longLabel=longCard?.querySelector(".al-ranking-choice-title");',
    'checks.longModalTitleClamped=!!longLabel && longCard.scrollWidth<=longCard.clientWidth+1 && longLabel.getBoundingClientRect().height<=parseFloat(getComputedStyle(longLabel).lineHeight)*2+2 && longLabel.textContent===longTitle;',
    'checks.longModalFits=modal.getBoundingClientRect().width<=innerWidth+1 && modal.getBoundingClientRect().height<=innerHeight+1;',
    'modal.querySelector(".al-ranking-dialog-action:last-child").click();await delay();',
    'data.anime.ordered=["anime/A.md","anime/B.md","anime/C.md","anime/"+longTitle+".md"];data.anime.pending={};data.anime.active=null;data.anime.round=null;await redraw();',
    'checks.listCovers=root.querySelectorAll(".al-ranking-row img").length===4 && root.querySelectorAll(".al-ranking-handle").length===4;',
    'const listStyle=getComputedStyle(root.querySelector(".al-ranking-list"));',
    'const rankRows=[...root.querySelectorAll(".al-ranking-row")];',
    'const rankRect=rankRows[0].getBoundingClientRect();const listRect=root.querySelector(".al-ranking-list").getBoundingClientRect();',
    'const rankNum=rankRows[0].querySelector(".al-ranking-position").getBoundingClientRect();',
    'const rankCover=rankRows[0].querySelector(".al-ranking-row-cover").getBoundingClientRect();',
    'const rankTitle=rankRows[0].querySelector(".al-ranking-row-title").getBoundingClientRect();',
    'const rankHandle=rankRows[0].querySelector(".al-ranking-handle").getBoundingClientRect();',
    'checks.oneWorkPerRow=listStyle.gridTemplateColumns.trim().split(" ").length===1 && rankRows.every((row,i)=>i===0||row.getBoundingClientRect().top>=rankRows[i-1].getBoundingClientRect().bottom-1);',
    'checks.fullWidthRows=rankRect.width>=listRect.width-2 && rankRect.width<=listRect.width+2;',
    'checks.leftAlignedContents=rankNum.left<rankCover.left && rankCover.right<=rankTitle.left+1 && rankCover.left-listRect.left<105;',
    'checks.dragHandleAtRight=listRect.right-rankHandle.right<25 && rankHandle.left>rankTitle.left;',
    'checks.noOversizedGreyButton=getComputedStyle(rankRows[0].querySelector(".al-ranking-open")).backgroundColor==="rgba(0, 0, 0, 0)" && getComputedStyle(rankRows[0]).backgroundColor==="rgba(0, 0, 0, 0)";',
    'checks.noRedundantRowActions=root.querySelectorAll(".al-ranking-move,.al-ranking-more").length===0 && !root.textContent.includes("區間重排");',
    'checks.longRowClamped=[...root.querySelectorAll(".al-ranking-row-title")].every(el=>el.getBoundingClientRect().width<=el.parentElement.getBoundingClientRect().width+1 && el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)*2+2);',
    'const grip=root.querySelector(".al-ranking-handle");',
    'grip.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}));await delay();',
    'checks.keyboardMove=data.anime.ordered[1]==="anime/A.md" && data.anime.ordered[0]==="anime/B.md";',
    'checks.noSearchInput=!root.querySelector(".al-ranking-search") && !root.querySelector("input[type=search]");',
    'checks.dragRemainsAvailable=[...root.querySelectorAll(".al-ranking-handle")].every(handle=>!handle.disabled);',
    'checks.noScoreMutation=items.every(x=>x.score===undefined);',
    'checks.touchHandleOnly=getComputedStyle(root.querySelector(".al-ranking-handle")).touchAction==="none" && getComputedStyle(root.querySelector(".al-ranking-open")).touchAction!=="none";',
    'checks.noOverflow=document.documentElement.scrollWidth<=innerWidth+1 && root.scrollWidth<=innerWidth+1;',
    'const emptyRoot=document.createElement("section");emptyRoot.style.display="none";document.body.append(emptyRoot);',
    'let emptyStoreReads=0;const badPersistedStore={load:async()=>{emptyStoreReads++;throw Error("invalid saved round");},mutate:store.mutate};',
    'const emptyOpts={...opts,items:[note("Unfinished","anime","ongoing")],store:badPersistedStore,redraw:()=>{}};',
    'await AnimeListRanking.renderRankingPanel(emptyRoot,emptyOpts);',
    'checks.noCompletedEmptyState=!!emptyRoot.querySelector(".al-ranking-empty") && !emptyRoot.querySelector(".al-ranking-error") && !!emptyRoot.querySelector(".al-ranking-type-tabs");',
    'checks.noCompletedDoesNotReadDamagedRound=emptyStoreReads===0;',
    'emptyRoot.remove();',
    'document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});',
    '</script></body></html>',
  ].join("\n");
  for (const viewport of [
    { width: 320, height: 720, deviceScaleFactor: 2, mobile: true },
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 768, height: 900, deviceScaleFactor: 1, mobile: false },
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false },
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, "profile-" + viewport.width),
      viewport,
      testName: "Ranking interaction " + viewport.width + "px",
      interact: async ({ send, sleep }) => {
        // Capture the actual bundled ranking UI after browser interactions finish.
        // This is a DOM screenshot, not a separately drawn design mockup.
        for (let attempt = 0; attempt < 140; attempt++) {
          const current = await send("Runtime.evaluate", {
            expression: "document.body.dataset.result", returnByValue: true,
          });
          if (current.result.value === "pass" || current.result.value === "fail") break;
          await sleep(40);
        }
        const result = await send("Page.captureScreenshot", {
          format: "png", fromSurface: true, captureBeyondViewport: false,
        });
        await writeFile(
          path.join(screenshots, "ranking-" + viewport.width + ".png"),
          Buffer.from(result.data, "base64"),
        );
      },
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

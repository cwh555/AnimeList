import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "ranking-drag");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: { contents: 'export { renderRankingPanel } from "./src/ui/pairwise-ranking/panel";',
      resolveDir: root, loader: "ts" },
    outfile: path.join(output, "ranking.js"),
    bundle: true, platform: "browser", format: "iife", globalName: "Ranking", target: "es2022",
    plugins: [{
      name: "obsidian-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: 'export function setIcon(){} export class Menu{addItem(){return this}showAtPosition(){}} export class Modal{constructor(){this.modalEl=document.createElement("div");this.contentEl=document.createElement("div")}open(){}close(){}}',
        }));
      },
    }],
  });
  const [js, css] = await Promise.all([
    readFile(path.join(output, "ranking.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const html = [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>:root{--background-primary:#111;--background-primary-alt:#202020;--background-secondary:#242424;--background-modifier-border:#444;--text-normal:#eee;--text-muted:#aaa;--interactive-accent:#9177ee;--radius-m:8px;--radius-s:4px;--font-ui-small:13px}*{box-sizing:border-box}body{margin:0;background:#111;color:#eee}#root{height:660px;overflow:auto;padding:10px}'+css+'</style>',
    '</head><body data-stage="loading" data-result="pending"><div id="root" class="al-workspace-page-body"></div>',
    '<script>window.createEl=(tag)=>document.createElement(tag);window.createDiv=()=>document.createElement("div");HTMLElement.prototype.addClass=function(...a){this.classList.add(...a)};HTMLElement.prototype.empty=function(){this.replaceChildren()};HTMLElement.prototype.createEl=function(tag,options){const el=document.createElement(tag);if(options?.text)el.textContent=options.text;this.append(el);return el};</script>',
    '<script>'+js+'</script><script>',
    '(async()=>{',
    'const items=Array.from({length:9},(_,i)=>({title:"Work "+i,filePath:"anime/"+i+".md",mediaType:"anime",status:"completed",cover:"data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2280%22%20height=%22120%22/%3E"}));',
    'const blank=()=>({ordered:[],pending:{},active:null,round:null,history:[]});',
    'let state={version:1,anime:{...blank(),ordered:items.map(x=>x.filePath)},manga:blank(),novel:blank()};window.rankState=state;',
    'const root=document.getElementById("root");',
    'const store={load:async()=>state,mutate:async(fn)=>{const next=structuredClone(state);fn(next);state=next;window.rankState=state;return state;}};',
    'const opts={app:{},store,items,type:"anime",setType:()=>{},redraw:()=>Ranking.renderRankingPanel(root,opts),openNote:async()=>{},showNotice:(message)=>{throw Error(message)}};',
    'await Ranking.renderRankingPanel(root,opts);document.body.dataset.stage="ready";',
    '})().catch((e)=>{document.body.dataset.result="fail";document.body.dataset.details=String(e.stack||e)});',
    '</script></body></html>',
  ].join("\n");
  for (const viewport of [
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false },
  ]) {
    await runChromiumDatasetTest({
      html, viewport, profile: path.join(output, "profile-" + viewport.width),
      testName: "Ranking pointer preview " + viewport.width + "px", resultTimeoutMs: 9000,
      interact: async ({ send, sleep }) => {
        const evaluate = async (expression) => {
          const result = await send("Runtime.evaluate", { expression, returnByValue: true });
          return result.result.value;
        };
        for (let i = 0; i < 100; i++) {
          if (await evaluate("document.body.dataset.stage") === "ready") break;
          await sleep(50);
        }
        const coords = JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll(".al-ranking-handle")].map(el=>({x:el.getBoundingClientRect().left+el.getBoundingClientRect().width/2,y:el.getBoundingClientRect().top+el.getBoundingClientRect().height/2})))'));
        if (coords.length !== 9) throw new Error("Ranking handles missing");
        const a = coords[0], b = coords[4];
        if (viewport.mobile) {
          await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
          await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
          await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [b] });
        } else {
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
          await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: b.x, y: b.y, button: "left", buttons: 1 });
        }
        await sleep(120);
        const during = JSON.parse(await evaluate('JSON.stringify({overlay:document.querySelectorAll(".al-ranking-drag-preview").length,source:document.querySelectorAll(".al-ranking-row.is-rank-moving").length,target:document.querySelectorAll(".al-ranking-row.is-rank-target").length,transform:document.querySelector(".al-ranking-drag-preview")?.style.transform,overflow:document.documentElement.scrollWidth>innerWidth+1})'));
        if (viewport.mobile) {
          await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
          await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
        }
        await sleep(260);
        const after = JSON.parse(await evaluate('JSON.stringify({overlay:document.querySelectorAll(".al-ranking-drag-preview").length,source:document.querySelectorAll(".al-ranking-row.is-rank-moving").length,order:window.rankState.anime.ordered,handles:document.querySelectorAll(".al-ranking-handle").length})'));
        const checks = {
          preview: during.overlay === 1 && Boolean(during.transform?.startsWith("translate3d(")),
          placeholder: during.source === 1,
          dropTarget: during.target === 1,
          cleanup: after.overlay === 0 && after.source === 0,
          reordered: after.order[0] !== "anime/0.md",
          unique: after.order.length === 9 && new Set(after.order).size === 9,
          handles: after.handles === 9,
          noOverflow: !during.overflow,
        };
        await evaluate("document.body.dataset.details=" + JSON.stringify(JSON.stringify(checks))
          + ";document.body.dataset.result=" + JSON.stringify(Object.values(checks).every(Boolean) ? "pass" : "fail"));
      },
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

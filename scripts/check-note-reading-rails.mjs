import { build, stop } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "note-reading-rails");
const screenshotPath = "/tmp/animelist-note-reading-rails-demo.png";
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { decorateNoteReadingRails } from "./src/features/note-reading-rails/feature";
      export { calculateNoteReadingRailGeometry } from "./src/ui/note-reading-rails";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "note-reading-rails.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListNoteReadingRails",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: "export function setIcon() {}",
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "note-reading-rails.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const cover = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22600%22%20height%3D%22900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20stop-color%3D%22%233b5f98%22%2F%3E%3Cstop%20offset%3D%22.52%22%20stop-color%3D%22%23856eb7%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23d59a70%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%22440%22%20cy%3D%22210%22%20r%3D%22100%22%20fill%3D%22%23fff%22%20opacity%3D%22.65%22%2F%3E%3Cpath%20d%3D%22M0%20710L150%20540%20250%20630%20380%20470%20600%20680V900H0Z%22%20fill%3D%22%23243b5a%22%2F%3E%3C%2Fsvg%3E";

function fixture(mode = "validate") {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#17171a;--background-primary-alt:#1c1c20;--background-secondary:#222228;--background-secondary-alt:#29292f;--background-modifier-border:#3a3a42;--background-modifier-hover:#303038;--interactive-accent:#8b6cff;--text-normal:#ececf0;--text-muted:#aaaab4;--text-faint:#7d7d88;--text-accent:#a998ff;}
html,body{margin:0;min-height:100%;background:#121215;color:#ececf0;font-family:Inter,system-ui,sans-serif}button{font:inherit}
${styles}
#preview{position:relative;width:1400px;max-width:100%;min-height:960px;margin:0 auto;padding:28px 0 100px;overflow:visible;background:#17171a}
.markdown-preview-sizer{width:720px;max-width:calc(100% - 32px);margin:0 auto;position:relative}
#ordinary,#after{line-height:1.65}#ordinary h1{font-size:30px;margin:0 0 14px}#ordinary p,#after p{color:#c9c9d0}
#detail-container{margin:20px 0}.al-detail-card{display:block}.al-detail-cover img{display:block;width:100%}
.demo-section{margin:26px 0;padding:14px;border:1px solid #303038;border-radius:10px}.demo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.demo-thumb{height:105px;border-radius:8px;background:linear-gradient(135deg,#29456d,#8a669c 55%,#d5936b)}
</style></head><body data-result="pending"><div id="preview" class="markdown-preview-view"><div id="sizer" class="markdown-preview-sizer">
<section id="ordinary"><h1>葬送的芙莉蓮</h1><p>中央仍然是 Obsidian 自己的 Markdown。AnimeList 只利用原本沒有使用到的左右空間。</p></section>
<div id="detail-container"><div class="al-detail-card"><div class="al-detail-topbar"><div class="al-detail-summary"><div class="al-detail-stat"><span class="al-detail-stat-label">Status</span><span class="al-detail-status-chip al-status status-completed">已完成</span></div><div class="al-detail-stat"><span class="al-detail-stat-label">Progress</span><span class="al-detail-stat-value al-detail-progress-value">28 / 28 集</span></div><div class="al-detail-stat"><span class="al-detail-stat-label">Score</span><span class="al-detail-stat-value al-detail-score">★ 9.5</span></div><div class="al-detail-stat"><span class="al-detail-stat-label">季度</span><span class="al-detail-stat-value">2023 秋</span></div></div><div class="al-detail-buttons"><button class="al-detail-favorite" aria-label="加入最愛">☆</button><button>✎ <span>編輯</span></button><button>▣ <span>Library</span></button><button class="al-detail-more" aria-label="更多">⋯</button></div></div><div class="al-detail-body"><div class="al-detail-cover"><img src="${cover}" alt="cover"></div><dl class="al-detail-metadata"><div class="al-detail-meta-row"><dt class="al-detail-meta-label">原文標題</dt><dd class="al-detail-meta-value">葬送のフリーレン</dd></div><div class="al-detail-meta-row"><dt class="al-detail-meta-label">Format</dt><dd class="al-detail-meta-value">TV</dd></div><div class="al-detail-meta-row"><dt class="al-detail-meta-label">Year</dt><dd class="al-detail-meta-value">2023</dd></div><div class="al-detail-meta-row"><dt class="al-detail-meta-label">Studio</dt><dd class="al-detail-meta-value">Madhouse</dd></div></dl></div></div><section class="al-detail-actions al-release-tracking-detail"><span class="al-detail-summary"><strong>最新集數</strong><span>Vol.14</span></span></section></div>
<section id="after"><h2>Image Section</h2><div class="demo-section"><div class="demo-grid"><div class="demo-thumb"></div><div class="demo-thumb"></div><div class="demo-thumb"></div><div class="demo-thumb"></div><div class="demo-thumb"></div><div class="demo-thumb"></div></div></div><h2>Moments</h2><p>「那只不過是我人生百分之一的旅程。」</p><div style="height:420px"></div></section>
</div></div><div id="live" class="markdown-source-view"><div id="live-sizer" class="markdown-preview-sizer"><div id="live-container"><div class="al-detail-card"><div class="al-detail-topbar"></div><div class="al-detail-body"></div></div></div></div></div>
<script>window.createEl=(tag,options)=>{const el=document.createElement(tag);if(options?.cls)el.className=options.cls;return el;};window.createDiv=(options)=>window.createEl('div',options);HTMLElement.prototype.scrollIntoView=function(){this.dataset.railScrolled='true';};</script><script>${bundle}</script><script>
(async()=>{try{
const api=AnimeListNoteReadingRails;const preview=document.querySelector('#preview');const sizer=document.querySelector('#sizer');const container=document.querySelector('#detail-container');const ordinary=document.querySelector('#ordinary');const after=document.querySelector('#after');const card=container.querySelector('.al-detail-card');const body=card.querySelector('.al-detail-body');const topbar=card.querySelector('.al-detail-topbar');const release=container.querySelector('.al-release-tracking-detail');
const frontmatter={title:'葬送的芙莉蓮',title_original:'葬送のフリーレン',title_romaji:'Sousou no Frieren',title_aliases:['Frieren'],started_at:'2026-08-20',completed_at:'2026-08-31'};
api.decorateNoteReadingRails(container,'AnimeList/Anime/葬送的芙莉蓮.md',frontmatter);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
if('${mode}'==='demo'){document.body.dataset.details='demo active';document.body.dataset.result='pass';return;}
const details={};const left=preview.querySelector('.al-note-reading-left');const right=preview.querySelector('.al-note-reading-right');const layer=preview.querySelector('.al-note-reading-rail-layer');
details.geometryEnabled=api.calculateNoteReadingRailGeometry({layerLeft:0,layerRight:1400,contentLeft:340,contentRight:1060}).enabled===true;
details.railsActive=preview.classList.contains('al-note-reading-active')&&!!left&&!!right;
details.detailMoved=body.parentElement===left&&topbar.parentElement===right&&release.parentElement===right;
details.markdownUntouched=ordinary.parentElement===sizer&&after.parentElement===sizer;
details.identity=left?.querySelector('.al-detail-rail-title')?.textContent==='葬送的芙莉蓮'&&left?.querySelector('.al-detail-rail-aliases')?.textContent?.includes('Sousou no Frieren');
details.dates=right?.querySelector('.al-detail-rail-dates')?.textContent?.includes('2026-08-20')&&right?.querySelector('.al-detail-rail-dates')?.textContent?.includes('2026-08-31');
details.iconLabels=right?.querySelectorAll('.al-detail-rail-only-label').length===2;
const outline=right?.querySelector('.al-note-reading-outline'),outlineItems=[...(outline?.querySelectorAll('.al-note-reading-outline-item')??[])];
details.outline=outline?.querySelector('.al-note-reading-outline-label')?.textContent==='On this note'&&outlineItems.map(item=>item.textContent).join('|')==='Image Section|Moments';
outlineItems.find(item=>item.textContent==='Moments')?.click();details.outlineNavigation=after.querySelectorAll('h2')[1]?.dataset.railScrolled==='true';
const lr=left.getBoundingClientRect(),cr=sizer.getBoundingClientRect(),rr=right.getBoundingClientRect();details.noOverlap=lr.right<=cr.left+1&&rr.left>=cr.right-1;
details.noHorizontalOverflow=left.scrollWidth<=left.clientWidth+1&&right.scrollWidth<=right.clientWidth+1;
details.stickyLayer=getComputedStyle(layer).position==='sticky';details.cardHidden=getComputedStyle(card).display==='none';
preview.style.width='900px';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));details.narrowFallback=!preview.classList.contains('al-note-reading-active')&&body.parentElement===card&&topbar.parentElement===card&&release.parentElement===container;
const live=document.querySelector('#live-container'),liveCard=live.querySelector('.al-detail-card'),liveTop=liveCard.querySelector('.al-detail-topbar'),liveBody=liveCard.querySelector('.al-detail-body');api.decorateNoteReadingRails(live,'AnimeList/live.md',frontmatter);await new Promise(r=>requestAnimationFrame(r));details.livePreviewUntouched=!document.querySelector('#live .al-note-reading-rail-layer')&&liveTop.parentElement===liveCard&&liveBody.parentElement===liveCard;
preview.style.width='1400px';api.decorateNoteReadingRails(container,'AnimeList/Anime/葬送的芙莉蓮.md',frontmatter);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));container.remove();await new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),80));details.cleanup=!preview.querySelector('.al-note-reading-rail-layer')&&!preview.classList.contains('al-note-reading-active');
document.body.dataset.details=JSON.stringify(details);document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
}catch(error){document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail';}})();
</script></body></html>`;
}

try {
  await runChromiumDatasetTest({
    html: fixture("validate"),
    profile: path.join(output, "profile-validate"),
    testName: "Media note Reading View rails behavior",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html: fixture("demo"),
    profile: path.join(output, "profile-demo"),
    testName: "Media note Reading View rails demo",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false },
    interact: async ({ send, sleep }) => {
      await sleep(250);
      const captured = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(screenshotPath, Buffer.from(captured.data, "base64"));
    },
  });
  console.log(`Media note Reading View rails screenshot: ${screenshotPath}`);
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

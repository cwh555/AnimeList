import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "reading-note-layout");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'import "./src/ui-text"; import { registerLocaleMessages, setActiveLocale } from "./src/i18n/catalog"; import { EN_CORE_MESSAGES } from "./src/i18n/locales/en/core"; registerLocaleMessages("core", "en", EN_CORE_MESSAGES); setActiveLocale("en"); export { installReadingNoteLayout, mountReadingNoteLayoutWhenReady } from "./src/ui/note-reading-layout";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "AnimeListReadingNote",
    target: "es2022",
    logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: 'export function setIcon(host, name) { host.dataset.icon = name; } export function normalizePath(value) { return String(value || ""); }',
        }));
      },
    }],
  });

  const [bundle, styles] = await Promise.all([
    readFile(path.join(output, "bundle.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const cover = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520"><rect width="100%" height="100%" fill="#324a73"/><circle cx="180" cy="195" r="85" fill="#768eba"/><path d="M30 500Q180 265 330 500Z" fill="#c9bad4"/></svg>');
  const longText = Array.from({length:32}, (_,i) => '<p class="prose">This paragraph is part of the original Markdown. Original notes, images and Moments remain in their native content flow — section ' + (i+1) + '.</p>').join("");

  function fixture({ leafWidth, mobile = false, wrappedSizer = false, delayedAttach = false, leafMode = false }) {
    const bodyClass = mobile ? "is-mobile" : "";
    return `<!doctype html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <style>
      :root{--background-primary:#16191f;--background-secondary:#222831;--background-secondary-alt:#28374a;--background-modifier-border:#485263;--background-modifier-hover:#374052;--interactive-accent:#8fa8eb;--text-normal:#e8ebf4;--text-muted:#adb6c8;--text-faint:#7e8999;--text-accent:#9caef4;--font-ui-small:13px;}
      *{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;background:#101217;color:#e8ebf4;font-family:system-ui,sans-serif}
      .markdown-reading-view{display:flex;justify-content:center;min-height:100%;padding:16px;}
      .markdown-preview-view{width:${leafWidth}px;max-width:100%;height:710px;overflow:auto;border:1px solid #3a4050;background:#16191f;position:relative}
      .markdown-preview-sizer{width:100%;max-width:740px;margin:0 auto;padding:16px;}
      .markdown-preview-sizer>h1{font-size:1.3rem} .prose{margin:16px 0;line-height:1.7;font-size:14px;color:#c6cfde}
      .moment-card,.image-card{margin:18px 0;padding:18px;border:1px solid #41506e;border-radius:12px;background:#212a3a}
      ${styles}
      </style></head><body class="${bodyClass}" data-result="pending">
      <main class="markdown-reading-view"><div class="markdown-preview-view">
      <div class="markdown-preview-sizer">
       <h1 id="native-heading">Example Anime — My Notes</h1>
       <div id="detail-block" class="el-pre"><div class="block-language-animelist-detail" id="detail-host"><div class="al-detail-card">Native detail header</div></div></div>
       <p id="untouched" class="prose">A note written directly in Markdown, not a duplicate data model.</p>
       <div id="image-section" class="image-card"><h3>Images</h3><p>Native image sections remain in their original place.</p></div>
       <div id="moment-section" class="moment-card"><h3>Moments</h3><p>Although it was only a short time...</p></div>
       ${longText}
      </div></div></main>
      <script>window.createEl=(tag)=>document.createElement(tag);</script>
      <script>${bundle}</script>
      <script>(async()=>{
        const checks={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
        const view=document.querySelector(".markdown-preview-view");
        const sizer=document.querySelector(".markdown-preview-sizer");
        const prose=document.querySelector("#untouched");
        const section=document.querySelector("#image-section");
        const moments=document.querySelector("#moment-section");
        const oldNodes=[...sizer.children];
        const originalSizerParent=sizer.parentElement;
        if (${wrappedSizer}) {
          const wrapper=document.createElement("div");
          wrapper.className="reading-sizer-wrapper";
          sizer.before(wrapper);wrapper.append(sizer);
        }
        if (${leafMode}) {
          const root=view.closest(".markdown-reading-view");
          root.className="workspace-leaf-content";
          root.dataset.type="markdown";
        }
        const actions={edit:0,fav:0,library:0};
        const plugin={openEditModal(){actions.edit++},async setFavorite(){actions.fav++},async openLibrary(){actions.library++}};
        const data={
          title:"Example Anime", originalTitle:"Example Anime — Original", coverResource:${JSON.stringify(cover)},
          mediaType:"anime",format:"TV",year:"2026",people:"Animation Studio",status:"ongoing",
          statusLabel:"Watching",progress:"7 / 12 episodes",score:"9.5",quarter:"Fall 2026",
          sourceUrl:"https://example.org/title",sourceLabel:"Bangumi",favorite:false,
        };
        const file={path:"AnimeList/Anime/Example.md"};
        const detail=document.querySelector("#detail-host");
        const initialWidth=view.clientWidth;
        const expectWide=initialWidth>=1100 && !document.body.classList.contains("is-mobile");
        let controller;
        if (${delayedAttach}) {
          const root=view.parentElement;
          const parent=root.parentElement;
          root.remove();
          controller=AnimeListReadingNote.mountReadingNoteLayoutWhenReady(detail,file,plugin);
          controller.update(data);
          await sleep(90);
          checks.detachedDoesNotMount=!view.querySelector(":scope > .al-reading-note-rails");
          parent.append(root);
          await sleep(180);
          checks.mountAfterAttachment=!!view.querySelector(":scope > .al-reading-note-rails");
        } else {
          controller=AnimeListReadingNote.installReadingNoteLayout(detail,file,plugin);
          if(!controller) throw new Error("Expected Reading View controller was not installed");
          controller.update(data);
          checks.detachedDoesNotMount=true;
          checks.mountAfterAttachment=true;
        }
        await sleep(80);
        checks.onlyLocalViewChanged=!!view.querySelector(":scope > .al-reading-note-rails")
          && sizer.parentElement===( ${wrappedSizer} ? view.querySelector(".reading-sizer-wrapper") : originalSizerParent )
          && [...sizer.children].every((c,i)=>c===oldNodes[i])
          && prose.parentElement===sizer && section.parentElement===sizer && moments.parentElement===sizer;
        checks.widthActivation=view.classList.contains("al-reading-note-wide")===expectWide;
        checks.nativeDetailFallback=expectWide
          ? getComputedStyle(document.querySelector("#detail-block")).display==="none"
          : getComputedStyle(document.querySelector("#detail-block")).display!=="none";
        checks.railContents=!!document.querySelector(".al-reading-note-rail-left img")
          && document.querySelector(".al-reading-note-rail-right").textContent.includes("7 / 12")
          && document.querySelector(".al-reading-note-rail-left").textContent.includes("Animation Studio");
        checks.noninterference=AnimeListReadingNote.installReadingNoteLayout(detail,file,plugin)===null;
        if(expectWide){
          const left=document.querySelector(".al-reading-note-rail-left").getBoundingClientRect();
          const right=document.querySelector(".al-reading-note-rail-right").getBoundingClientRect();
          const center=prose.getBoundingClientRect();
          checks.columnsDontOverlap=left.right+8 < center.left && right.left-8 > center.right;
          const before=left.top;
          view.scrollTop=550;
          await sleep(90);
          checks.stickyRail=Math.abs(document.querySelector(".al-reading-note-rail-left").getBoundingClientRect().top-before)<=3;
          view.scrollTop=0;
          document.querySelector(".al-reading-note-action.is-primary").click();
          document.querySelector('[aria-pressed="false"].al-reading-note-action').click();
          document.querySelector(".al-reading-note-actions button:last-child").click();
          checks.actions=actions.edit===1 && actions.fav===1 && actions.library===1;
          controller.update({...data,progress:"8 / 12 episodes",favorite:true});
          checks.freshData=document.querySelector(".al-reading-note-rail-right").textContent.includes("8 / 12")
            && !!document.querySelector('.al-reading-note-action[aria-pressed="true"]');
        } else {
          checks.columnsDontOverlap=true;checks.stickyRail=true;checks.actions=true;checks.freshData=true;
        }
        if(expectWide) {
          view.style.width="820px";
          await sleep(90);
          checks.narrowFallback=!view.classList.contains("al-reading-note-wide")
            && getComputedStyle(document.querySelector("#detail-block")).display!=="none";
          view.style.width=${JSON.stringify(leafWidth+"px")};
          await sleep(90);
          checks.wideRestored=view.classList.contains("al-reading-note-wide");
        } else { checks.narrowFallback=true;checks.wideRestored=true; }
        controller.dispose();
        checks.unloadRestores= !view.classList.contains("al-reading-note-wide")
          && !view.querySelector(".al-reading-note-rails")
          && !document.querySelector("#detail-block").classList.contains("al-reading-note-original")
          && [...sizer.children].every((c,i)=>c===oldNodes[i]);
        const embedded=document.createElement("div");
        embedded.className="markdown-embed";
        const nested=document.createElement("div");
        embedded.append(nested);sizer.append(embedded);
        checks.embedExcluded=AnimeListReadingNote.installReadingNoteLayout(nested,file,plugin)===null;
        embedded.remove();
        if(expectWide){
          const restored=AnimeListReadingNote.installReadingNoteLayout(detail,file,plugin);
          if(!restored)throw new Error("Failed to reinstall Reading View layout");
          restored.update(data);
          const replacementBlock=document.createElement("div");
          replacementBlock.className="el-pre";
          const replacementDetail=document.createElement("div");
          replacementDetail.className="block-language-animelist-detail";
          replacementBlock.append(replacementDetail);
          sizer.insertBefore(replacementBlock,prose);
          const newer=AnimeListReadingNote.installReadingNoteLayout(replacementDetail,file,plugin);
          checks.newRenderChildReplacesPrevious=!!newer
            && view.querySelectorAll(":scope > .al-reading-note-rails").length===1;
          newer?.update({...data,progress:"9 / 12 episodes"});
          restored.dispose();
          checks.oldUnloadDoesNotRemoveNew=!!view.querySelector(":scope > .al-reading-note-rails")
            && document.querySelector(".al-reading-note-rail-right").textContent.includes("9 / 12");
          newer?.dispose();
          replacementBlock.remove();
          const final=AnimeListReadingNote.installReadingNoteLayout(detail,file,plugin);
          checks.ownerClearedForReinstall=!!final
            && view.querySelectorAll(":scope > .al-reading-note-rails").length===1;
          final?.update(data);
          await sleep(70);
        }
        document.body.dataset.details=JSON.stringify(checks);
        document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";
      })().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});</script>
      </body></html>`;
  }

  for(const {width,mobile=false,wrappedSizer=false,delayedAttach=false,leafMode=false} of [
    {width:1480}, {width:840}, {width:390,mobile:true},
    {width:1480,wrappedSizer:true,leafMode:true},
    {width:1480,delayedAttach:true},
  ]) {
    const html=fixture({leafWidth:mobile?390:width,mobile,wrappedSizer,delayedAttach,leafMode});
    await runChromiumDatasetTest({
      html,
      profile:path.join(output,"profile-"+width),
      viewport:{width:mobile?390:Math.max(width+40,1000),height:850,mobile,deviceScaleFactor:1},
      testName:"AnimeList Note Reading View "+width+"px"+(wrappedSizer?" wrapped-leaf":"")+(delayedAttach?" delayed-attach":""),
      resultTimeoutMs:7000,
      interact:width!==1480 ? undefined : async ({send,sleep})=>{
        for(let attempt=0;attempt<120;attempt++){
          const r=await send("Runtime.evaluate",{expression:"document.body.dataset.result",returnByValue:true});
          if(r.result?.value && r.result.value!=="pending")break;
          await sleep(60);
        }
        const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
        await writeFile(path.join(root,".tmp","note-reading-layout-preview.png"),Buffer.from(screenshot.data,"base64"));
      },
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

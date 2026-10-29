import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "characters-ui");
const screenshots = path.join(root, ".tmp", "characters-ui-screenshots");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { renderCharacterPage } from "./src/ui/characters/character-page"; export { CharacterNoteCard } from "./src/ui/characters/character-note-card"; export { characterFeature } from "./src/features/characters/feature"; export { TFile } from "obsidian";',
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
            'export class MarkdownRenderChild { constructor(container){this.containerEl=container;} registerEvent(){} }',
            'export class Modal { constructor(app){this.app=app;this.modalEl=document.createElement("div");this.modalEl.className="modal";this.contentEl=document.createElement("div");this.contentEl.className="modal-content";this.modalEl.append(this.contentEl);} open(){document.body.append(this.modalEl);this.onOpen?.();} close(){this.onClose?.();this.modalEl.remove();} }',
            'export class Notice { constructor(message){ (window.__notices ||= []).push(message); } }',
            'export class Menu { addItem(handler){const item={setTitle(value){this.title=value;return this},setIcon(){return this},setWarning(){return this},onClick(callback){this.execute=callback;return this}};handler(item);(window.__menuItems ||= []).push(item);return this;} showAtMouseEvent(){} }',
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
    'const chars=Array.from({length:3},(_,i)=>({id:"c"+i,path:"AnimeList/Characters/c"+i+".md",name:"Character "+i,tier:i===0?"top":"liked",bangumiId:String(i+1),portrait:"Assets/a.png",appearances:i===0?["Anime/Test.md"]:[]}));',
    'const resources=new Map(chars.map(c=>[c.path,new CharactersFixture.TFile(c.path)]));resources.set("Assets/a.png",new CharactersFixture.TFile("Assets/a.png"));resources.set("Assets/b.png",new CharactersFixture.TFile("Assets/b.png"));',
    'let srcText=[String.fromCharCode(96).repeat(3)+"animelist-images","- Assets/a.png","- Assets/b.png",String.fromCharCode(96).repeat(3)].join("\\n");',
    'const disk=new Map();const adapter={exists:async p=>p===".obsidian"||disk.has(p),readBinary:async p=>new TextEncoder().encode(disk.get(p)??"").buffer,writeBinary:async(p,value)=>{disk.set(p,new TextDecoder().decode(value))},process:async(p,change)=>{const next=change(disk.get(p)??"");disk.set(p,next);return next},mkdir:async()=>{}};',
    'const app={vault:{configDir:".obsidian",getAbstractFileByPath:p=>p==="AnimeList/Characters"?{children:chars.map(c=>resources.get(c.path))}:(resources.get(p)??null),cachedRead:async()=>srcText,getResourcePath:()=>pixel,adapter},metadataCache:{getFileCache:f=>{const c=chars.find(item=>item.path===f.path);return {frontmatter:c?{animelist_character:true,character_id:c.id,character_name:c.name,character_tier:c.tier,bangumi_character_id:c.bangumiId,character_portrait:c.portrait,character_appearances:c.appearances}:{}}},getFirstLinkpathDest:p=>resources.get(p)??null,on:()=>({})},fileManager:{processFrontMatter:async(file,modify)=>{const c=chars.find(item=>item.path===file.path);if(!c)throw Error("No character");const frontmatter={character_portrait:c.portrait};modify(frontmatter);c.portrait=frontmatter.character_portrait}}};',
    'const service={list:async()=>chars,setTier:async()=>{},setPortrait:async(path,value)=>{const item=chars.find(c=>c.path===path);if(item)item.portrait=value},setName:async()=>{},ensureVisibleWorks:async()=>{},attachImage:async()=>true,createImageSession:async()=>{const fence=String.fromCharCode(96).repeat(3);srcText+="\\n\\n"+fence+"animelist-images\\n"+fence+"\\n";}};',
    'const host={app,settings:{libraryRoot:"AnimeList",coverFolder:"AnimeList/Covers"},getImageThumbnailSources:()=>undefined,collectMediaItems:()=>[],openMediaFile:async path=>{window.__openedPath=path},refreshViews:()=>{},openLibrarySection:async()=>{},ensureFolder:async()=>{},uniqueFilePath:async()=>""};',
    'const root=document.querySelector("#root");const actions=document.querySelector("#actions");',
    'const context={pageActions:actions,samePageRefresh:false,signal:new AbortController().signal};',
    'const delay=()=>new Promise(r=>setTimeout(r,100));const checks={};',
    'const clickRequired=(selector)=>{const control=document.querySelector(selector);if(!control)throw Error("Missing clickable control: "+selector);control.click()};',
    '(async()=>{',
    'await CharactersFixture.renderCharacterPage(host,service,root,context);await delay();',
    'checks.libraryCardCount=root.querySelectorAll(".al-character-card").length===3;',
    'checks.libraryCardHasPortrait=!!root.querySelector(".al-character-card .al-character-cover img");',
    'checks.noHorizontalOverflow=root.scrollWidth<=root.clientWidth+2;',
    'checks.usesLibraryCardStyles=!!root.querySelector(".al-character-grid.al-grid .al-character-card.al-card .al-cover-wrap .al-cover");',
    'checks.uncroppedCover=getComputedStyle(root.querySelector(".al-character-card .al-cover")).objectFit==="contain";',
    'checks.sparseCardsStayCompact=root.querySelector(".al-character-card").getBoundingClientRect().width<=215;',
    'clickRequired(".al-character-card");await delay();',
    'checks.cardClickOpensNote=window.__openedPath==="AnimeList/Characters/c0.md";',
    'checks.cardDoesNotReplaceWorkspace=root.querySelectorAll(".al-character-card").length===3;',
    'window.__openedPath=null;',
    'root.querySelector(".al-character-card .al-edit-button").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));',
    'checks.editKeyboardDoesNotOpenNote=window.__openedPath===null;',
    'clickRequired(".al-character-card .al-edit-button");await delay();',
    'checks.editIsNativeAnimeListModal=!!document.querySelector(".animelist-modal.al-character-edit-modal");',
    'checks.compactEditorHasPreview=!!document.querySelector(".al-character-edit-current-cover img");',
    'checks.noDuplicateCoverPicker=!document.querySelector(".al-character-cover-option,.al-character-cover-options");',
    'checks.noUnrelatedImageManagerButtons=!document.querySelector(".al-character-edit-extras,.al-character-edit-actions .al-character-remove-button");',
    'checks.galleryCoverEntry=!!document.querySelector(".al-character-edit-cover-link button");',
    'checks.editorHasTwoFooterActions=document.querySelectorAll(".al-character-edit-actions button").length===2;',
    'clickRequired(".al-character-edit-cover-link button");await delay();',
    'checks.editorGalleryOpensNote=window.__openedPath==="AnimeList/Characters/c0.md";',
    'checks.editorClosedOnGallery=!document.querySelector(".al-character-edit-modal");',
    'checks.staysOnLibrary=root.querySelectorAll(".al-character-card").length===3;',
    'clickRequired(".al-character-card .al-edit-button");await delay();',
    'clickRequired(".al-character-edit-actions button:last-child");await delay();',
    'checks.basicEditsCloseModal=!document.querySelector(".al-character-edit-modal");',
    'clickRequired(".al-character-mode-tabs button:nth-child(2)");await delay();',
    'checks.crossCharacterGallery=root.querySelectorAll(".al-gallery-image-tile").length===6;',
    'checks.galleryCoverMenus=root.querySelectorAll(".al-gallery-cover-menu").length===6;',
    'const tiles=root.querySelectorAll(".al-gallery-image-tile");',
    'const secondImage=[...tiles].find(tile=>tile.dataset.galleryKey==="AnimeList/Characters/c0.md::Assets/b.png");const coverAction=secondImage?.querySelector(".al-gallery-cover-menu");if(!coverAction)throw Error("No second artwork cover menu");',
    'coverAction.click();const setCover=window.__menuItems?.at(-1)?.execute;if(!setCover)throw Error("Cover menu did not expose action");setCover();await delay();',
    'checks.gallerySetCoverPersisted=chars[0].portrait==="Assets/b.png";',
    'const coverNotices=(window.__notices??[]).slice();',
    'checks.galleryCoverNoErrors=coverNotices.length===0;',

    'checks.noIrrelevantMediaFilter=getComputedStyle(root.querySelector(".al-gallery-type-filters")).display==="none";',
    'clickRequired(".al-character-mode-tabs button:nth-child(3)");await delay();',
    'checks.rankingShowsAll=root.querySelectorAll(".al-character-ranking-row").length===3;',
    'checks.rankingRange=root.querySelector(".al-character-rank")?.textContent==="#1–3";',
    'clickRequired(".al-ranking-actions button");await delay();',
    'checks.rankingOffersTwoChoices=document.querySelectorAll(".al-ranking-choice").length===2;',
    'clickRequired(".al-ranking-choice");await delay();',
    'checks.rankingAnswerHandled=!(window.__notices??[]).some(message=>String(message).includes("失敗")||String(message).includes("failed")||String(message).includes("Failed"));',
    'const media=document.createElement("div");media.className="animelist-detail";const mediaBody=document.createElement("div");mediaBody.className="al-detail-body";media.appendChild(mediaBody);document.body.appendChild(media);',
    'const detail=CharactersFixture.characterFeature.contributions.find(item=>item.kind==="detail");detail.afterRender({host,container:media,sourcePath:"Anime/Test.md",frontmatter:{media_type:"anime",source_provider:"bangumi",source_id:"88"}});await delay();',
    'checks.workDetailShowsCharacter=media.querySelectorAll(".al-character-work-person").length===1;',
    'checks.workDetailIsInsideOriginalCard=!!media.querySelector(".al-detail-body > .al-character-work-section");',
    'checks.workDetailOffersCastPicker=!!media.querySelector(".al-character-work-add");',
    'clickRequired(".al-character-work-person");await delay();',
    'checks.workCharacterOpensNote=window.__openedPath==="AnimeList/Characters/c0.md";',
    'document.body.dataset.details=JSON.stringify({checks,coverNotices,allNotices:window.__notices??[],portrait:chars[0].portrait,source:srcText});document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"});',
  ].join("\n");
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
    + ':root{--background-primary:#111;--background-primary-alt:#161616;--background-secondary:#222;--background-secondary-alt:#292929;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--interactive-accent:#8275d9;--text-on-accent:white}*{box-sizing:border-box}body{margin:0;color:#eee;background:#111;font-family:sans-serif}input,button{font:inherit}'
    + css + '</style></head><body data-result="pending"><div id="actions"></div><main id="root" class="animelist-native-view"></main><script>'
    + bundle + '</script><script>' + js + '</script></body></html>';
  await runChromiumDatasetTest({
    html, profile: path.join(output, "profile"),
    testName: "AnimeList Characters native-card, note/editor, gallery and Ranking interactions",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    screenshotPath: path.join(screenshots, "characters-mobile-interactions.png"),
  });
  // Capture the actual compiled Character editor at desktop dimensions;
  // these are DOM screenshots, not generated illustrations.
  const editorBootstrap = js.slice(0, js.indexOf("const delay=")).replace("length:3", "length:1");
  const editorCheck = [
    '(async()=>{',
    'await CharactersFixture.renderCharacterPage(host,service,root,context);',
    'const edit=root.querySelector(".al-character-card .al-edit-button");',
    'if(!edit)throw Error("Character edit control missing");',
    'edit.click();await new Promise(resolve=>setTimeout(resolve,100));',
    'const modal=document.querySelector(".al-character-edit-modal");',
    'const frame=modal?.querySelector(".al-character-edit-current-cover");',
    'const data={editorOpens:!!modal,coverPreview:!!frame,',
    'noDuplicateGallery:!modal?.querySelector(".al-character-cover-option"),',
    'compact:modal?.getBoundingClientRect().width<=650};',
    'document.body.dataset.details=JSON.stringify(data);',
    'document.body.dataset.result=Object.values(data).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"})',
  ].join("\n");
  await runChromiumDatasetTest({
    html: html.replace(js, editorBootstrap + editorCheck),
    profile: path.join(output, "profile-editor"),
    testName: "AnimeList compact Character editor Desktop visual contract",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1480, height: 900, deviceScaleFactor: 1 },
    screenshotPath: path.join(screenshots, "characters-desktop-editor.png"),
  });
  const noteScript = [
    '(async()=>{',
    'const container=document.createElement("div");container.style.maxWidth="850px";document.body.appendChild(container);',
    'const note=new CharactersFixture.CharacterNoteCard(container,host,"AnimeList/Characters/c0.md");',
    'note.onload();',
    'const checks={infoCard:!!container.querySelector(".al-character-note-card"),',
    'characterCover:!!container.querySelector(".al-character-note-cover img"),',
    'relatedWork:!!container.querySelector(".al-character-note-work-links button")};',
    'document.body.dataset.details=JSON.stringify(checks);',
    'document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"})',
  ].join("\n");
  await runChromiumDatasetTest({
    html: html.replace(js, js.slice(0, js.indexOf("const delay=")) + noteScript),
    profile: path.join(output, "profile-note"),
    testName: "AnimeList native Character note summary Desktop visual contract",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1180, height: 780, deviceScaleFactor: 1 },
    screenshotPath: path.join(screenshots, "characters-desktop-note-summary.png"),
  });
  // Reproduce a wide Desktop window with exactly one character, as in the
  // reported screenshot; a 1-item auto-fill grid must not stretch its cover.
  const desktopBootstrap = js.slice(0, js.indexOf("const delay=")).replace("length:3", "length:1");
  const desktopCheck = [
    '(async()=>{',
    'await CharactersFixture.renderCharacterPage(host,service,root,context);',
    'const card=root.querySelector(".al-character-card");const cover=card?.querySelector(".al-cover");',
    'if(!card||!cover)throw Error("Character cover missing from desktop library");',
    'const checks={singleCard:root.querySelectorAll(".al-character-card").length===1,',
    'fixedWidth:card.getBoundingClientRect().width<=215,',
    'notGiant:card.getBoundingClientRect().height<=470,',
    'noCrop:getComputedStyle(cover).objectFit==="contain",',
    'nativeCard:card.classList.contains("al-card"),',
    'cardOpensNote:false};',
    'card.click();await Promise.resolve();await Promise.resolve();',
    'checks.cardOpensNote=window.__openedPath==="AnimeList/Characters/c0.md";',
    'document.body.dataset.details=JSON.stringify(checks);',
    'document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail"})',
  ].join("\n");
  const desktopHtml = html.replace(js, desktopBootstrap + desktopCheck);
  await runChromiumDatasetTest({
    html: desktopHtml, profile: path.join(output, "profile-desktop"),
    testName: "AnimeList single Character cover in wide Desktop workspace",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1480, height: 900, deviceScaleFactor: 1 },
    screenshotPath: path.join(screenshots, "characters-desktop-library.png"),
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

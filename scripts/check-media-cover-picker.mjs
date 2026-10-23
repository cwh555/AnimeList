import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "media-cover-picker");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { createMediaCoverPicker } from "./src/ui/media-cover-picker";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "CoverReplacement",
    target: "es2022",
    logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: 'export function setIcon() {} export function normalizePath(value) { return String(value || ""); }',
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
    '<style>:root{--background-secondary:#222;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--font-ui-small:13px;--font-ui-smaller:12px}body{background:#171717;color:#eee;font-family:sans-serif}'+styles+'</style>',
    '</head><body data-result="pending"><div id="root"></div>',
    '<script>window.createEl=(tag)=>document.createElement(tag);</script>',
    '<script>'+bundle+'</script>',
    '<script>',
    '(async()=>{',
    ' const checks={};const oldRevoke=URL.revokeObjectURL.bind(URL);let revoked=0;',
    ' URL.revokeObjectURL=(url)=>{revoked++;oldRevoke(url);};',
    ' const current="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22140%22%20height=%22210%22%3E%3Crect%20width=%22140%22%20height=%22210%22%20fill=%22%23888%22/%3E%3C/svg%3E";',
    ' const plugin={resolveMediaCoverPath:(path)=>path==="covers/old.jpg"?current:path};',
    ' const picker=CoverReplacement.createMediaCoverPicker(plugin,{path:"AnimeList/Anime/Work.md"},{cover:"covers/old.jpg",cover_remote:"https://old.invalid/image.jpg"});',
    ' document.getElementById("root").append(picker.element);',
    ' const input=picker.element.querySelector("input[type=file]");',
    ' const clear=picker.element.querySelector("button.al-edit-cover-clear");',
    ' checks.previewInitiallyCollapsed=picker.element.querySelector(".al-edit-cover-previews")?.hidden===true&&!!picker.element.querySelector("button.al-file-picker-trigger");',
    ' checks.noUploadInitially=await picker.readSelectedAsset()===null && clear.hidden;',
    ' const png=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhmcAAAAASUVORK5CYII="),c=>c.charCodeAt(0));',
    ' const choose=(name)=>{const transfer=new DataTransfer();transfer.items.add(new File([png],name,{type:"image/png"}));input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));};',
    ' choose("replacement.png");',
    ' const first=await picker.readSelectedAsset();',
    ' checks.fileSelection=first?.name==="replacement.png"&&first.contentType==="image/png"&&first.data.byteLength===png.byteLength;',
    ' checks.replacementPreview=!!picker.element.querySelector(".al-edit-cover-replacement-body img")&&!clear.hidden&&!picker.element.querySelector(".al-edit-cover-previews").hidden;',
    ' const firstUrl=picker.element.querySelector(".al-edit-cover-replacement-body img")?.src;',
    ' choose("second.png");',
    ' checks.replacingSelectionRevokesPrevious=revoked===1&&picker.element.querySelector(".al-edit-cover-replacement-body img")?.src!==firstUrl;',
    ' clear.click();',
    ' checks.clearRestoresExisting=await picker.readSelectedAsset()===null && clear.hidden && picker.element.querySelector(".al-edit-cover-previews").hidden && revoked===2;',
    ' checks.oldCoverStillVisible=picker.element.querySelector(".al-edit-cover-preview img")?.src===current;',
    ' choose("third.png");picker.dispose();',
    ' checks.closeReleasesPreview=revoked===3;',
    ' const rect=picker.element.getBoundingClientRect();',
    ' checks.mobileLayoutFits=rect.width<=innerWidth+1&&picker.element.scrollWidth<=innerWidth+1;',
    ' document.body.dataset.details=JSON.stringify(checks);',
    ' document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});',
    '</script></body></html>',
  ].join("\n");
  for(const viewport of [
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    { width: 320, height: 720, deviceScaleFactor: 2, mobile: true },
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false },
  ]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, "profile-"+viewport.width),
      viewport,
      testName: "Media cover picker "+viewport.width+"px",
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "modal-ui-protocol");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  await build({
    absWorkingDir: root,
    stdin: {
      contents: 'export { createMediaEditorIdentity, updateMediaEditorIdentityTitle } from "./src/ui/media-editor-layout"; export { createUiAction, createFilePickerControl } from "./src/ui/ui-primitives";',
      resolveDir: root,
      loader: "ts",
    },
    outfile: path.join(output, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "UiProtocol",
    target: "es2022",
    logLevel: "warning",
    plugins: [{
      name: "obsidian-browser-stub",
      setup(ctx) {
        ctx.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          loader: "js",
          contents: "export function setIcon() {} export function normalizePath(value) { return String(value || ''); }",
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
    '<style>:root{--background-secondary:#222;--background-primary:#171717;--background-modifier-border:#555;--text-normal:#eee;--text-muted:#aaa;--interactive-accent:#9577e9}*{box-sizing:border-box}body{margin:0;background:#171717;color:#eee;font-family:sans-serif}',
    styles, '</style></head><body data-result="pending"><div id="root"></div>',
    '<script>window.createEl=(tag)=>document.createElement(tag);</script>',
    '<script>', bundle, '</script>',
    '<script>(async()=>{const checks={};',
    'const longTitle="とても長いタイトル「堀與宮村」".repeat(8);',
    'const add=document.createElement("div");add.className="modal animelist-modal";const addContent=document.createElement("div");addContent.className="modal-content";add.append(addContent);',
    'const edit=document.createElement("div");edit.className="modal animelist-modal animelist-edit-modal";const editContent=document.createElement("div");editContent.className="modal-content";edit.append(editContent);',
    'const values={title:longTitle,originalTitle:"ホリミヤ",provider:"Bangumi",coverAlt:"cover",missingCoverText:"No cover"};',
    'addContent.append(UiProtocol.createMediaEditorIdentity(values));editContent.append(UiProtocol.createMediaEditorIdentity(values));',
    'const confirm=document.createElement("div");confirm.className="modal animelist-modal animelist-confirm-modal al-dialog-compact";',
    'const content=document.createElement("div");content.className="modal-content";confirm.append(content);',
    'content.append(document.createElement("h2"));const desc=document.createElement("p");desc.textContent="「"+longTitle+"」的 Markdown notes 會移到系統垃圾桶；本地封面不會一併刪除。";content.append(desc);',
    'const actions=document.createElement("div");actions.className="al-modal-actions";',
    'const cancel=UiProtocol.createUiAction("取消");const remove=UiProtocol.createUiAction("刪除","danger");actions.append(cancel,remove);content.append(actions);',
    'const picker=UiProtocol.createFilePickerControl("選擇檔案","image/png");editContent.append(picker.element);',
    'document.getElementById("root").append(add,edit,confirm);',
    'const a=add.querySelector(".al-media-editor-identity"),b=edit.querySelector(".al-media-editor-identity");',
    'const bounded=el=>el.scrollWidth<=el.clientWidth+1;',
    'checks.identitySharedStructure=a.outerHTML===b.outerHTML;',
    'const heading=a.querySelector("h2");UiProtocol.updateMediaEditorIdentityTitle(a,"更新後譯名","更新後封面");',
    'checks.enrichedTitleUpdatesInPlace=a.querySelector("h2")===heading&&heading.textContent==="更新後譯名";',
    'checks.identityNoOverflow=bounded(a)&&bounded(b)&&bounded(a.querySelector(".al-media-editor-identity-copy"));',
    'checks.compactOuterMatchesContent=confirm.getBoundingClientRect().width<=521&&content.getBoundingClientRect().width<=confirm.getBoundingClientRect().width+1;',
    'checks.confirmNoOverflow=bounded(confirm)&&bounded(content)&&bounded(desc);',
    'checks.actionVisible=cancel.getBoundingClientRect().width>=40&&remove.getBoundingClientRect().width>=40;',
    'checks.pickerUsesStyledButton=!!picker.element.querySelector("button.al-ui-button")&&picker.input.type==="file"&&picker.input.accept==="image/png";',
    'checks.fileInputNotVisuallyExposed=getComputedStyle(picker.input).opacity==="0";',
    'checks.longTitleWrap=getComputedStyle(a.querySelector("h2")).whiteSpace==="normal";',
    'document.body.dataset.details=JSON.stringify(checks);document.body.dataset.result=Object.values(checks).every(Boolean)?"pass":"fail";',
    '})().catch(e=>{document.body.dataset.details=String(e?.stack||e);document.body.dataset.result="fail";});</script></body></html>',
  ].join("");
  for (const width of [320, 390, 768, 1200]) {
    await runChromiumDatasetTest({
      html,
      profile: path.join(output, "profile-" + width),
      viewport: { width, height: 800, deviceScaleFactor: width < 600 ? 2 : 1, mobile: width < 600 },
      testName: "Modal UI protocol " + width + "px",
    });
  }
} finally {
  stop();
  await rm(output, { recursive: true, force: true });
}

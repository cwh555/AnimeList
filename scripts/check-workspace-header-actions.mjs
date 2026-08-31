import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "workspace-header-actions");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { renderAnimeListWorkspaceShell } from "./src/ui/workspace-shell";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "workspace-header-actions.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListWorkspaceHeaderActions",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `
          export function setIcon(parent, name) { parent.dataset.icon = name; }
          export class MenuItem {
            setTitle(value) { this.title = value; return this; }
            setIcon(value) { this.icon = value; return this; }
            onClick(value) { this.callback = value; return this; }
          }
          export class Menu {
            addItem(callback) {
              const item = new MenuItem();
              callback(item);
              (window.__workspaceMenuItems ||= []).push(item.title);
              return this;
            }
            showAtMouseEvent() { window.__workspaceMenuShown = (window.__workspaceMenuShown || 0) + 1; }
          }
        `,
      }));
    },
  }],
});

const [bundle, styles] = await Promise.all([
  readFile(path.join(output, "workspace-header-actions.js"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
]);

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:#111;--background-primary-alt:#171717;--background-secondary:#202020;--background-secondary-alt:#282828;--background-modifier-border:#444;--background-modifier-hover:#333;--interactive-accent:#8070df;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--text-on-accent:#fff;}
html,body{margin:0;width:100%;min-height:100%;background:#111;color:#eee;font-family:sans-serif}button{font:inherit}
${styles}
</style></head><body data-result="pending"><div id="app" class="animelist-native-view"></div>
<script>
window.createEl=(tag)=>document.createElement(tag);
for(const [name,fn] of Object.entries({
 addClass:function(...names){this.classList.add(...names)},
 removeClass:function(...names){this.classList.remove(...names)},
 toggleClass:function(name,force){this.classList.toggle(name,force)},
})) { if(!HTMLElement.prototype[name]) Object.defineProperty(HTMLElement.prototype,name,{value:fn}); }
</script><script>${bundle}</script><script>
try {
  const app = document.querySelector("#app");
  const pages = [{ id:"library", label:"Library", icon:"library", order:10, render(){} }];
  const runs = [];
  const action = (id, label, icon, order) => ({ id, label, icon, order, run(){ runs.push(id); } });
  const render = (actions) => AnimeListWorkspaceHeaderActions.renderAnimeListWorkspaceShell(app, {
    pages,
    activeSection:"library",
    actions,
    onSelect(){},
  });
  const click = (element) => element?.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));

  render([
    action("release-updates", "更新追蹤", "refresh-cw", 10),
    action("export-library", "匯出", "download", 20),
  ]);
  const twoActions = [...app.querySelectorAll(".al-workspace-action")];
  const twoActionIds = twoActions.map((button) => button.dataset.actionId).join(",");
  click(twoActions[0]);
  click(twoActions[1]);
  const header = app.querySelector(".al-workspace-header");
  const actions = app.querySelector(".al-workspace-header-actions");
  const twoDirect = twoActions.length === 2
    && twoActionIds === "release-updates,export-library"
    && !app.querySelector(".al-workspace-more");
  const twoActionsRunDirectly = runs.join(",") === "release-updates,export-library";
  const twoActionsFitHeader = header.scrollWidth <= header.clientWidth + 1
    && actions.getBoundingClientRect().right <= header.getBoundingClientRect().right + 1
    && document.documentElement.scrollWidth <= innerWidth + 1;

  window.__workspaceMenuItems = [];
  render([
    action("release-updates", "更新追蹤", "refresh-cw", 10),
    action("export-library", "匯出", "download", 20),
    action("maintenance", "維護", "wrench", 30),
  ]);
  const threeDirect = [...app.querySelectorAll(".al-workspace-action")];
  const more = app.querySelector(".al-workspace-more");
  click(more);
  const thirdActionUsesOverflowOnly = threeDirect.length === 2
    && threeDirect.map((button) => button.dataset.actionId).join(",") === "release-updates,export-library"
    && !!more
    && window.__workspaceMenuShown === 1
    && window.__workspaceMenuItems.join(",") === "維護";

  render([action("export-library", "匯出", "download", 20)]);
  const oneAction = app.querySelector(".al-workspace-action");
  const oneActionStaysDirect = !!oneAction
    && oneAction.dataset.actionId === "export-library"
    && !app.querySelector(".al-workspace-more");

  const details = {
    twoDirect,
    twoActionsRunDirectly,
    twoActionsFitHeader,
    thirdActionUsesOverflowOnly,
    oneActionStaysDirect,
  };
  document.body.dataset.details = JSON.stringify(details);
  document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
} catch (error) {
  document.body.dataset.details = String(error?.stack || error);
  document.body.dataset.result = "fail";
}
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile: path.join(profile, "desktop"),
    testName: "Workspace header keeps two primary actions visible on desktop",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false },
  });
  await runChromiumDatasetTest({
    html,
    profile: path.join(profile, "mobile"),
    testName: "Workspace header keeps two primary actions visible on mobile",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

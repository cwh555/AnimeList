import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "user-tag-manager");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { UserTagManagerModal } from "./src/ui/user-tag-manager-modal";`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "user-tag-manager.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListTagManager",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `
          export class Modal {
            constructor(app) {
              this.app = app;
              this.modalEl = document.createElement("div");
              this.modalEl.className = "modal";
              this.contentEl = document.createElement("div");
              this.contentEl.className = "modal-content";
              this.modalEl.appendChild(this.contentEl);
            }
            open() { document.body.appendChild(this.modalEl); this.onOpen?.(); }
            close() { this.onClose?.(); this.modalEl.remove(); }
          }
          export class Notice { constructor(message) { window.__lastNotice = String(message); } }
          export function setIcon() {}
        `,
        loader: "js",
      }));
    },
  }],
});
const bundle = await readFile(path.join(output, "user-tag-manager.js"), "utf8");

const html = `<!doctype html>
<html>
<body data-result="pending">
  <script>
    window.createDiv = () => document.createElement("div");
    window.createSpan = () => document.createElement("span");
    window.createEl = (tag) => document.createElement(tag);
  </script>
  <script>${bundle}</script>
  <script>
    const works = [
      { filePath: "AnimeList/Anime/a.md", title: "Work A", tags: ["重看", "戀愛"] },
      { filePath: "AnimeList/Anime/b.md", title: "Work B", tags: ["重看"] },
      { filePath: "AnimeList/Manga/c.md", title: "Work C", tags: ["收藏"] },
    ];
    let catalog = ["戀愛", "重看", "收藏"];
    let refreshes = 0;
    const key = (value) => value.toLocaleLowerCase();
    const service = {
      usageCounts() {
        const counts = new Map();
        for (const work of works) for (const tag of work.tags) counts.set(key(tag), (counts.get(key(tag)) || 0) + 1);
        return counts;
      },
      usages(tag) {
        return works.filter((work) => work.tags.some((entry) => key(entry) === key(tag)))
          .map(({ filePath, title }) => ({ filePath, title }));
      },
      async rename(current, next) {
        let changedNotes = 0;
        for (const work of works) {
          if (!work.tags.some((entry) => key(entry) === key(current))) continue;
          work.tags = [...new Set(work.tags.map((entry) => key(entry) === key(current) ? next : entry))];
          changedNotes += 1;
        }
        return { changedNotes };
      },
      async remove(tag) {
        let changedNotes = 0;
        for (const work of works) {
          const before = work.tags.length;
          work.tags = work.tags.filter((entry) => key(entry) !== key(tag));
          if (work.tags.length !== before) changedNotes += 1;
        }
        return { changedNotes };
      },
      async removeFromWork(tag, filePath) {
        const work = works.find((entry) => entry.filePath === filePath);
        if (!work) return { changedNotes: 0 };
        const before = work.tags.length;
        work.tags = work.tags.filter((entry) => key(entry) !== key(tag));
        return { changedNotes: work.tags.length === before ? 0 : 1 };
      },
    };
    const modal = new AnimeListTagManager.UserTagManagerModal({}, catalog, service, {
      async saveCatalog(next) { catalog = [...next]; },
      refreshViews() { refreshes += 1; },
    });
    modal.open();

    const details = {};
    details.verticalRows = document.querySelectorAll(".al-user-tag-row").length === 3
      && document.querySelectorAll(".al-user-tag-catalog-chip").length === 0;

    [...document.querySelectorAll(".al-user-tag-row")].find((row) => row.querySelector(".al-user-tag-row-name")?.textContent === "重看").click();
    details.usageList = document.querySelectorAll(".al-user-tag-usage-row").length === 2
      && document.body.textContent.includes("Work A")
      && document.body.textContent.includes("Work B");

    [...document.querySelectorAll(".al-user-tag-usage-row")]
      .find((row) => row.querySelector(".al-user-tag-usage-title")?.textContent === "Work A")
      .querySelector(".al-user-tag-usage-remove").click();

    setTimeout(async () => {
      details.removeOneWork = !works[0].tags.includes("重看")
        && works[1].tags.includes("重看")
        && catalog.includes("重看")
        && document.querySelectorAll(".al-user-tag-usage-row").length === 1;

      const renameInput = document.querySelector(".al-user-tag-rename-row input");
      renameInput.value = "稍後重看";
      document.querySelector(".al-user-tag-rename-row .mod-cta").click();

      setTimeout(() => {
        details.renameUpdatesUsage = catalog.includes("稍後重看")
          && !catalog.includes("重看")
          && works[1].tags.includes("稍後重看")
          && document.body.textContent.includes("Work B");
        details.refreshes = refreshes >= 2;
        document.body.dataset.details = JSON.stringify(details);
        document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
      }, 30);
    }, 30);
  </script>
</body>
</html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "User tag manager interaction test",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

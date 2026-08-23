import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const styles = await readFile(path.join(process.cwd(), "styles.css"), "utf8");
const profile = await mkdtemp(path.join(os.tmpdir(), "animelist-hidden-contract-"));
const cases = [
  ["timeline-controls", "div", "al-timeline-controls", ""],
  ["gallery-search", "label", "al-gallery-search", ""],
  ["gallery-columns", "label", "al-gallery-columns", ""],
  ["library-columns", "label", "al-library-column-control", ""],
  ["lightbox-missing", "div", "al-image-lightbox-missing", ""],
  ["moment-toggle", "button", "al-moment-text-toggle", ""],
  ["moment-nav", "button", "al-moment-scroll-nav", ""],
  ["tag-picker", "div", "al-tag-picker", ""],
  ["date-support", "div", "al-completion-date-support", ""],
  ["date-input", "div", "al-date-input", ""],
  ["image-expand", "button", "al-image-expand-button", ""],
  ["serial-report", "pre", "al-serial-cover-report", ""],
];
const nodes = cases.map(([id, tag, className, style]) => `<${tag} id="${id}" class="${className}" hidden style="${style}">hidden</${tag}>`).join("");
const html = `<!doctype html><html><head><style>${styles}</style></head><body data-result="pending"><div class="animelist-native-view"><div class="al-workspace-shell"><div class="al-workspace-page is-timeline">${nodes}<div id="timeline-scale" class="al-timeline-scale-actions" hidden>hidden</div><div class="al-serial-cover-actions"><button id="nested-classless-button" hidden>hidden</button></div><div class="al-library-export-options"><section id="nested-classless-section" hidden>hidden</section></div></div></div></div><div class="animelist-modal"><button id="modal-classless-button" hidden>hidden</button></div><script>
const details={};
for(const el of document.querySelectorAll('[hidden]')) details[el.id]=getComputedStyle(el).display==='none';
const visible=document.createElement('div'); visible.className='al-timeline-controls'; visible.textContent='visible'; document.body.appendChild(visible);
details.visibleStateStillRenders=getComputedStyle(visible).display!=='none';
document.body.dataset.details=JSON.stringify(details); document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
</script></body></html>`;
await runChromiumDatasetTest({
  html,
  profile,
  testName: "AnimeList hidden-state contract",
  requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
  viewport: { width: 900, height: 700, deviceScaleFactor: 1 },
});

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "mobile-layout-browser");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const styles = await readFile(path.join(root, "styles.css"), "utf8");

function fixture(mode) {
  const mobile = mode === "mobile";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root { --background-primary:#111; --background-secondary:#222; --background-primary-alt:#181818; --background-modifier-border:#444; --background-modifier-form-field:#222; --interactive-accent:#7777dd; --text-normal:#eee; --text-muted:#aaa; --text-faint:#777; --text-on-accent:#fff; --input-shadow:none; }
    html,body{margin:0;width:100%;min-height:100%;} body{font-family:sans-serif;} ${styles}
  </style></head><body data-result="pending" data-mode="${mode}">
    <main class="animelist-native-view">
      <section class="al-shell">
        <header class="al-hero"><div><div class="al-kicker">Library</div><h1 class="al-title">AnimeList</h1><p class="al-desc">Description</p></div><div class="al-hero-right"><div class="al-stats"><div class="al-stat"><strong class="al-stat-number">12</strong><span class="al-stat-label">Anime</span></div><div class="al-stat"><strong class="al-stat-number">8</strong><span class="al-stat-label">Manga</span></div></div><div class="al-hero-actions"><button class="al-secondary-button">Timeline</button><button class="al-secondary-button">Scores</button><button id="touch" class="al-add-button">Add</button></div></div></header>
        <nav id="tabs" class="al-type-tabs"><button class="al-type-tab">All</button><button class="al-type-tab">Anime</button><button class="al-type-tab">Manga</button><button class="al-type-tab">Novel</button><button class="al-type-tab">Very long tab</button></nav>
        <div class="al-toolbar"><label class="al-search"><input></label><button id="filter-button" class="al-filter-button is-active"><span>Filter</span><span class="al-filter-count">2</span></button><label class="al-sort"><select><option>Sort</option></select></label><div class="al-view-switch"><button class="al-view-button">G</button><button class="al-view-button">L</button><button class="al-view-button">P</button></div></div>
        <div id="statuses" class="al-status-bar"><button class="al-status-chip">Watching</button><button class="al-status-chip">Completed</button><button class="al-status-chip">Planned</button><button class="al-status-chip">Dropped</button></div>
        <div id="grid" class="al-grid is-grid">${'<article class="al-card"><div class="al-cover-wrap"></div><div class="al-card-body"><h2 class="al-card-title">Title</h2><div class="al-facts"><span>2026</span></div><div class="al-progress"><div class="al-progress-row"><span>1/12</span></div></div></div></article>'.repeat(4)}</div>
        <div id="poster" class="al-grid is-poster">${'<article class="al-card"><div class="al-cover-wrap"></div><div class="al-card-body"><h2 class="al-card-title">Title</h2></div></article>'.repeat(4)}</div>
      </section>
    </main>
    <section class="animelist-score-dashboard-view"><div class="al-score-dashboard"><header class="al-score-dashboard-header"><div><h1 class="al-score-dashboard-title">Scores</h1></div></header><div class="al-score-dashboard-controls"><nav class="al-score-dashboard-tabs"><button class="al-score-dashboard-tab">All</button><button class="al-score-dashboard-tab">Anime</button></nav><div class="al-score-dashboard-action-group"><button class="al-score-tool-button">Unrated</button><button class="al-score-tool-button">Batch</button></div><label class="al-score-dashboard-zoom"><input type="range"></label></div><div class="al-score-board"><section id="score-group" class="al-score-group"><div class="al-score-major"><strong class="al-score-major-number">9</strong><span class="al-score-major-count">4 works</span></div><div class="al-score-group-lanes"><div id="score-lane" class="al-score-lane"><div class="al-score-lane-label">9.0</div><div id="score-posters" class="al-score-lane-posters">${'<button class="al-score-poster"></button>'.repeat(6)}</div></div></div></section></div></div></section>
    <div class="modal animelist-modal"><div class="modal-content"><div class="al-selected-preview"><img><div><h2>Selected title</h2></div></div><section class="al-media-metadata-section"><div id="metadata-grid" class="al-media-metadata-grid"><div class="al-media-metadata-item"><div class="al-media-metadata-label">作品形式</div><div class="al-media-metadata-value">TV 動畫</div></div><div class="al-media-metadata-item"><div class="al-media-metadata-label">製作公司</div><div class="al-media-metadata-value">CloverWorks</div></div><div class="al-media-metadata-item"><div class="al-media-metadata-label">季度</div><div class="al-media-metadata-value">2021 Q1 (冬季)</div></div></div></section><form class="al-media-form al-edit-media-form"><label class="al-form-field"><input></label><label class="al-form-field al-form-field-tags"><span class="al-form-label">標籤</span><div class="al-tag-control"><div class="al-tag-chip-set"><div class="al-tag-chip al-tag-chip-selected"><span>戀愛</span></div><div class="al-tag-chip al-tag-chip-selected"><span>重看</span></div><button id="tag-add" class="al-tag-add-button">+</button></div></div></label><div id="serial-row" class="al-volume-row"><div class="al-volume-row-fields"><label class="al-form-field"><input></label></div><div class="al-serial-cover-panel"><button class="al-serial-cover-button"></button><small class="al-serial-cover-status">Cover</small><div class="al-serial-cover-actions"><button>R</button><button>C</button></div></div><div class="al-volume-row-actions"><button class="al-delete-button">Remove</button></div></div></form><div class="al-modal-actions"><button>Cancel</button><button class="mod-cta">Save</button></div></div></div>
    <div id="filter-modal" class="modal animelist-modal animelist-library-filter-modal"><div class="modal-content"><div class="al-modal-heading"><h2>Filter</h2><p>Description</p></div><label class="al-filter-search"><input></label><div class="al-filter-groups"><section class="al-filter-group"><h3 class="al-filter-group-title">Company</h3><div id="filter-chips" class="al-filter-chips"><button id="filter-selected" class="al-filter-chip is-selected" aria-pressed="true">CloverWorks</button><button id="filter-unselected" class="al-filter-chip" aria-pressed="false">A-1 Pictures</button></div></section><section class="al-filter-group"><h3 class="al-filter-group-title">Quarter</h3><div class="al-filter-chips"><button class="al-filter-chip">2021 Q1</button></div></section><section class="al-filter-group"><h3 class="al-filter-group-title">Tags</h3><div class="al-filter-chips"><button class="al-filter-chip">Romance</button><button class="al-filter-chip">School</button></div></section></div><div class="al-modal-actions al-filter-actions"><button>Clear</button><span class="al-filter-action-spacer"></span><button>Cancel</button><button>Apply</button></div></div></div>
    <div id="tag-manager-modal" class="modal animelist-modal animelist-user-tag-modal"><div class="modal-content"><div class="al-modal-heading"><h2>Manage tags</h2><p>Manage reusable work tags.</p></div><label class="al-user-tag-search"><span class="al-icon"></span><input placeholder="Search tags"></label><div id="tag-manager-add" class="al-user-tag-add-row"><input placeholder="New tag"><button>Add tag</button></div><div id="tag-manager-list" class="al-user-tag-list"><button class="al-user-tag-row"><span class="al-user-tag-row-name">Rewatch</span><span class="al-user-tag-row-count">12 works</span></button><button class="al-user-tag-row"><span class="al-user-tag-row-name">Favorites</span><span class="al-user-tag-row-count">3 works</span></button></div><div id="tag-manager-rename" class="al-user-tag-rename-row"><input value="Rewatch"><button>Rename</button><button>Delete tag</button><button>Cancel</button></div><section class="al-user-tag-usage-section"><h3>Used by 2 works</h3><div id="tag-manager-usages" class="al-user-tag-usage-list"><div class="al-user-tag-usage-row"><span class="al-user-tag-usage-title">A very long anime title used to verify that the title truncates instead of overflowing</span><button class="al-user-tag-usage-remove">×</button></div><div class="al-user-tag-usage-row"><span class="al-user-tag-usage-title">Second work</span><button class="al-user-tag-usage-remove">×</button></div></div></section></div></div>
    <div class="modal-container"><div id="timeline-modal" class="modal animelist-timeline-modal"><div class="modal-content"><div class="al-timeline-root"><div class="al-timeline-toolbar"><div class="al-timeline-copy"><strong>Timeline</strong></div><div class="al-timeline-type-filters"><button class="al-timeline-type-filter">All</button><button class="al-timeline-type-filter">Anime</button></div><div class="al-timeline-controls"><div class="al-timeline-control-group"><button>-</button><button>+</button></div><button>Reset</button></div></div><div class="al-timeline-viewport"></div></div></div></div></div>
    <script>
      const cols = (element) => getComputedStyle(element).gridTemplateColumns.split(/\\s+/).filter(Boolean).length;
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const details = {};
      if (${mobile}) {
        details.gridTwoColumns = cols(document.querySelector('#grid')) === 2;
        details.posterTwoColumns = cols(document.querySelector('#poster')) === 2;
        details.posterCoverFirst = style('#poster .al-card').flexDirection === 'column';
        details.tabsSwipe = style('#tabs').overflowX === 'auto' && style('#tabs').flexWrap === 'nowrap';
        details.statusSwipe = style('#statuses').overflowX === 'auto' && style('#statuses').flexWrap === 'nowrap';
        details.touchTarget = document.querySelector('#touch').getBoundingClientRect().height >= 44;
        details.filterTouchTarget = document.querySelector('#filter-button').getBoundingClientRect().height >= 44;
        details.filterModalNearFullWidth = document.querySelector('#filter-modal').getBoundingClientRect().width >= innerWidth - 18;
        details.filterChipsWrap = style('#filter-chips').flexWrap === 'wrap';
        details.tagManagerNearFullWidth = document.querySelector('#tag-manager-modal').getBoundingClientRect().width >= innerWidth - 20;
        details.tagManagerAddSingleColumn = cols(document.querySelector('#tag-manager-add')) === 1;
        details.tagManagerRenameSingleColumn = cols(document.querySelector('#tag-manager-rename')) === 1;
        details.tagManagerRowsFit = document.querySelector('#tag-manager-list .al-user-tag-row').getBoundingClientRect().width <= document.querySelector('#tag-manager-list').getBoundingClientRect().width + 1;
        details.tagManagerUsageFits = document.querySelector('#tag-manager-usages .al-user-tag-usage-row').scrollWidth <= document.querySelector('#tag-manager-usages').clientWidth + 1;
        details.scoreSections = style('#score-group').display === 'block' && style('#score-lane').display === 'block';
        details.scoreRail = style('#score-posters').flexWrap === 'nowrap' && style('#score-posters').overflowX === 'auto';
        details.serialSingleColumn = cols(document.querySelector('#serial-row')) === 1;
        details.modalNearFullWidth = document.querySelector('.animelist-modal').getBoundingClientRect().width >= innerWidth - 12;
        details.metadataSingleColumn = cols(document.querySelector('#metadata-grid')) === 1;
        details.tagAddCircular = Math.abs(document.querySelector('#tag-add').getBoundingClientRect().width - document.querySelector('#tag-add').getBoundingClientRect().height) < 1;
        details.timelineFullHeight = document.querySelector('#timeline-modal').getBoundingClientRect().height >= innerHeight - 2;
      } else {
        details.desktopGridPreserved = cols(document.querySelector('#grid')) >= 3;
        details.desktopScoreGrid = style('#score-group').display === 'grid';
        details.desktopLaneWrap = style('#score-posters').flexWrap === 'wrap';
        details.desktopModalBounded = document.querySelector('.animelist-modal').getBoundingClientRect().width <= 860;
        details.desktopFilterModalBounded = document.querySelector('#filter-modal').getBoundingClientRect().width <= 720;
        details.desktopTagManagerBounded = document.querySelector('#tag-manager-modal').getBoundingClientRect().width <= 720;
        details.desktopTagManagerVerticalRows = style('#tag-manager-list .al-user-tag-row').display === 'grid'
          && document.querySelectorAll('#tag-manager-list .al-user-tag-row').length === 2;
        details.desktopTagManagerUsageRows = style('#tag-manager-usages .al-user-tag-usage-row').display === 'grid';
        details.filterChipSelectedByColor = style('#filter-selected').backgroundColor !== style('#filter-unselected').backgroundColor;
        details.filterThreeGroups = document.querySelectorAll('#filter-modal .al-filter-group').length === 3;
        details.desktopMetadataGrid = cols(document.querySelector('#metadata-grid')) === 3;
        details.tagAddCircular = Math.abs(document.querySelector('#tag-add').getBoundingClientRect().width - document.querySelector('#tag-add').getBoundingClientRect().height) < 1;
      }
      document.body.dataset.details = JSON.stringify(details);
      document.body.dataset.result = Object.values(details).every(Boolean) ? 'pass' : 'fail';
    </script>
  </body></html>`;
}

try {
  await runChromiumDatasetTest({
    html: fixture("mobile"),
    profile: path.join(output, "mobile-profile"),
    testName: "AnimeList mobile layout",
    viewport: { width: 390, height: 844, mobile: true },
  });
  await runChromiumDatasetTest({
    html: fixture("desktop"),
    profile: path.join(output, "desktop-profile"),
    testName: "AnimeList desktop layout regression",
    viewport: { width: 1200, height: 800, mobile: false },
  });
} finally {
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

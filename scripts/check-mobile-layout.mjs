import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";
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


function momentsFilmstripFixture(isMobile) {
  const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='1600' height='900' fill='%235b5b5b'/%3E%3C/svg%3E";
  const landscape = `<button class="al-moment-image" type="button" style="--al-moment-image-ratio:1.777"><img alt="" src="${pixel}"></button>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  ${styles}
  body { margin: 0; background: #181818; color: #ddd; --background-primary:#1e1e1e; --background-secondary:#252525; --background-modifier-border:#3c3c3c; --background-modifier-hover:#333; --interactive-accent:#8b5cf6; --text-normal:#ddd; --text-muted:#aaa; --text-faint:#777; --font-ui-medium:16px; --font-ui-small:13px; --font-ui-smaller:11px; }
  #fixture { width: min(1120px, calc(100vw - 24px)); margin: 12px auto; }
  </style></head><body data-result="pending"><section id="fixture" class="animelist-moments-section">
    <div class="al-moments-toolbar"><div class="al-moments-identity"><span class="al-moments-icon"></span><span class="al-moments-title">Moments</span><span class="al-moments-count">3</span></div><button class="al-moments-add" type="button">+</button></div>
    <div class="al-moments-list">
      <article id="single-card" class="al-moment-card" data-image-count="1">
        <div id="single-media" class="al-moment-media is-featured"><div class="al-moment-image-viewport"><div id="single-gallery" class="al-moment-image-row" data-image-count="1"><button id="single-image" class="al-moment-image" type="button" style="--al-moment-image-ratio:1.777"><img alt="" src="${pixel}"></button></div></div></div>
        <div id="single-content" class="al-moment-content has-metadata">
          <div id="metadata" class="al-moment-meta-section"><div class="al-moment-meta"><div class="al-moment-meta-row"><span class="al-moment-meta-label">出處</span><span class="al-moment-meta-value">第 1 話</span></div><div class="al-moment-meta-row"><span class="al-moment-meta-label">位置／時間</span><span class="al-moment-meta-value">旅途的記憶</span></div><div class="al-moment-meta-row"><span class="al-moment-meta-label">角色／說話者</span><span class="al-moment-meta-value">芙莉蓮</span></div></div><div class="al-moment-meta-row al-moment-tags-row"><span class="al-moment-meta-label">標籤</span><div class="al-moment-tags"><span class="al-moment-tag">回憶片段</span><span class="al-moment-tag">辛美爾</span></div></div><div class="al-moment-note"><span id="single-note-label" class="al-moment-meta-label">註記</span><div id="single-note-text" class="al-moment-note-text">完整 metadata 測試。</div></div></div>
          <div id="single-quote-panel" class="al-moment-quote-panel"><div class="al-moment-quote"><div class="al-moment-text">雖然只是很短的一段時間。</div><button class="al-moment-text-toggle" hidden>展開</button></div></div>
        </div>
        <button class="al-moment-actions" type="button">⋯</button>
      </article>
      <article id="two-card" class="al-moment-card" data-image-count="2">
        <div id="two-media" class="al-moment-media is-filmstrip"><div class="al-moment-image-viewport"><div id="two-gallery" class="al-moment-image-row" data-image-count="2">${landscape.repeat(2)}</div></div></div>
        <div id="two-content" class="al-moment-content without-metadata"><div id="two-quote-panel" class="al-moment-quote-panel"><div class="al-moment-quote"><div class="al-moment-text">旅途的意義，不在於目的地，而在於與你並肩看過的風景。</div><button class="al-moment-text-toggle" hidden>展開</button></div></div></div>
        <button class="al-moment-actions" type="button">⋯</button>
      </article>
      <article id="long-card" class="al-moment-card" data-image-count="7">
        <div id="long-media" class="al-moment-media is-filmstrip is-scrollable is-at-start"><div class="al-moment-image-viewport"><div id="long-gallery" class="al-moment-image-row" data-image-count="7">${landscape.repeat(7)}</div></div></div>
        <div id="long-content" class="al-moment-content has-metadata"><div id="long-metadata" class="al-moment-meta-section"><div class="al-moment-meta"><div class="al-moment-meta-row"><span class="al-moment-meta-label">出處</span><span class="al-moment-meta-value">第 1 話</span></div><div class="al-moment-meta-row"><span class="al-moment-meta-label">角色／說話者</span><span class="al-moment-meta-value">芙莉蓮</span></div></div><div class="al-moment-note"><span class="al-moment-meta-label">註記</span><div id="long-note-text" class="al-moment-note-text">這是一段刻意加長的註記，用來確認有足夠空間時內容會完整橫向顯示；當 metadata 欄位真的沒有足夠高度時，不會自己永久省略，而是跟右側文字共用同一個展開與收合狀態。展開之後這段註記必須完整顯示，收合時才回到緊湊版面。為了讓桌面與手機測試都確實進入 overflow 狀態，這裡再加入第二段說明：註記是一段連續的補充文字，不應像其他 metadata 一樣左右切成 label/value，也不應有獨立的省略號或第二個展開按鈕。</div></div></div><div id="long-quote-panel" class="al-moment-quote-panel"><div id="long-quote" class="al-moment-quote is-clampable"><div id="long-text" class="al-moment-text">人總是在不經意的時候被時間推著前行，在告別與相遇之間，才慢慢學會珍惜那些曾經並肩走過的日子。很多當下看似平凡的事情，往往要過了很久才知道它們有多重要。即使未來仍然有許多未知，只要記得那些一路上遇見的人、看過的風景，以及曾經想好好珍惜的心情，就還能繼續往前走。當時沒有特別放在心上的一句話、一場短暫的停留，甚至只是一起看過的普通風景，過了很久之後都可能變成最清楚的記憶。人也會在之後的旅途中慢慢理解曾經沒有理解的事情，因此再次回想同一段旅程時，感受到的重量也可能完全不同。這是一段特別加長的 Test Vault 文字，用來驗證長 quote 在更寬的新版文字欄位中仍不會把整張卡片無限制撐高，而是先以收合狀態呈現，需要時再由使用者展開閱讀完整內容。</div><button id="long-toggle" class="al-moment-text-toggle" type="button" hidden>展開</button></div></div></div>
        <button class="al-moment-actions" type="button">⋯</button>
      </article>
    </div>
  </section>
  <script>
    try {
      const singleCard = document.querySelector('#single-card');
      const singleMedia = document.querySelector('#single-media');
      const singleGallery = document.querySelector('#single-gallery');
      const singleImage = document.querySelector('#single-image');
      const singleContent = document.querySelector('#single-content');
      const metadata = document.querySelector('#metadata');
      const singleQuotePanel = document.querySelector('#single-quote-panel');
      const twoMedia = document.querySelector('#two-media');
      const twoGallery = document.querySelector('#two-gallery');
      const twoContent = document.querySelector('#two-content');
      const twoItems = [...twoGallery.querySelectorAll('.al-moment-image')];
      const longMedia = document.querySelector('#long-media');
      const longGallery = document.querySelector('#long-gallery');
      const longContent = document.querySelector('#long-content');
      const longMetadata = document.querySelector('#long-metadata');
      const longQuotePanel = document.querySelector('#long-quote-panel');
      const longItems = [...longGallery.querySelectorAll('.al-moment-image')];
      const longImages = [...longGallery.querySelectorAll('img')];

      const singleMediaRect = singleMedia.getBoundingClientRect();
      const singleContentRect = singleContent.getBoundingClientRect();
      const metadataRect = metadata.getBoundingClientRect();
      const singleQuoteRect = singleQuotePanel.getBoundingClientRect();
      const twoMediaRect = twoMedia.getBoundingClientRect();
      const twoContentRect = twoContent.getBoundingClientRect();
      const twoGalleryRect = twoGallery.getBoundingClientRect();
      const twoRects = twoItems.map((item) => item.getBoundingClientRect());
      const longMediaRect = longMedia.getBoundingClientRect();
      const longContentRect = longContent.getBoundingClientRect();
      const longMetadataRect = longMetadata.getBoundingClientRect();
      const longQuoteRect = longQuotePanel.getBoundingClientRect();
      const longGalleryRect = longGallery.getBoundingClientRect();
      const longRows = [...new Set(longItems.map((item) => Math.round(item.getBoundingClientRect().top)))];
      const quoteFont = parseFloat(getComputedStyle(singleQuotePanel.querySelector('.al-moment-text')).fontSize);
      const metadataFont = parseFloat(getComputedStyle(metadata.querySelector('.al-moment-meta-row')).fontSize);
      const metadataValues = [...metadata.querySelectorAll('.al-moment-meta-value')];
      const metadataValueLefts = metadataValues.map((value) => value.getBoundingClientRect().left);
      const singleNoteLabel = document.querySelector('#single-note-label');
      const singleNoteText = document.querySelector('#single-note-text');
      const singleNoteLabelRect = singleNoteLabel.getBoundingClientRect();
      const singleNoteTextRect = singleNoteText.getBoundingClientRect();
      const longNoteText = document.querySelector('#long-note-text');

      const longQuote = document.querySelector('#long-quote');
      const longText = document.querySelector('#long-text');
      const longToggle = document.querySelector('#long-toggle');
      const syncLongOverflow = () => {
        const overflow = longText.scrollHeight > longText.clientHeight + 2;
        longQuote.classList.toggle('is-clampable', overflow);
        longToggle.hidden = !overflow;
      };
      syncLongOverflow();
      const syncLongMetadata = (expanded) => {
        longMetadata.classList.remove('is-clamped');
        longMetadata.style.removeProperty('max-height');
        if (expanded) return;
        const naturalHeight = longMetadata.scrollHeight;
        const quoteHeight = longQuotePanel.getBoundingClientRect().height;
        const needsSharedExpansion = naturalHeight > quoteHeight + 34;
        if (needsSharedExpansion) {
          longToggle.hidden = false;
          longMetadata.classList.add('is-clamped');
          longMetadata.style.maxHeight = Math.max(88, longQuotePanel.getBoundingClientRect().height) + 'px';
        }
      };
      syncLongMetadata(false);
      const collapsedLongHeight = longText.getBoundingClientRect().height;
      const collapsedMetadataHeight = longMetadata.getBoundingClientRect().height;
      const collapsedNoteVisibleHeight = longNoteText.getBoundingClientRect().height;
      const longContentOverflows = longText.scrollHeight > collapsedLongHeight + 2;
      const longMetadataOverflows = longMetadata.scrollHeight > collapsedMetadataHeight + 2;
      const longToggleVisibleWhenCollapsed = !longToggle.hidden && longToggle.textContent === '展開';
      longQuote.classList.add('is-expanded');
      longToggle.textContent = '收合';
      syncLongMetadata(true);
      const expandedLongHeight = longText.getBoundingClientRect().height;
      const expandedMetadataHeight = longMetadata.getBoundingClientRect().height;
      const expandedNoteVisibleHeight = longNoteText.getBoundingClientRect().height;
      const longToggleVisibleWhenExpanded = !longToggle.hidden && longToggle.textContent === '收合';
      longQuote.classList.remove('is-expanded');
      longToggle.textContent = '展開';
      syncLongMetadata(false);

      longGallery.style.scrollBehavior = 'auto'; longGallery.style.scrollSnapType = 'none';
      longGallery.scrollLeft = Math.min(180, longGallery.scrollWidth - longGallery.clientWidth);
      const twoVisibleWidth = twoRects.reduce((sum, rect) => sum + rect.width, 0);
      const shared = {
        mediaAboveSingleContent: singleMediaRect.bottom <= singleContentRect.top + 2 && Math.abs(singleMediaRect.left - singleContentRect.left) <= 2 && Math.abs(singleMediaRect.right - singleContentRect.right) <= 2,
        mediaAboveTwoContent: twoMediaRect.bottom <= twoContentRect.top + 2,
        mediaAboveLongContent: longMediaRect.bottom <= longContentRect.top + 2,
        singleImageFitsViewport: singleImage.getBoundingClientRect().width <= singleGallery.getBoundingClientRect().width + 1 && singleImage.getBoundingClientRect().height <= singleGallery.getBoundingClientRect().height + 1,
        singleImageNeedsNoScroll: singleGallery.scrollWidth <= singleGallery.clientWidth + 1 && getComputedStyle(singleGallery).overflowX === 'hidden',
        featuredStageIsLandscape: singleGallery.getBoundingClientRect().width / singleGallery.getBoundingClientRect().height > 1.6,
        metadataSmallerThanQuote: metadataFont < quoteFont * 0.82,
        metadataVisible: metadata.querySelectorAll('.al-moment-meta-row').length >= 4 && metadata.querySelector('.al-moment-tag')?.textContent === '回憶片段' && metadata.querySelector('.al-moment-note-text')?.textContent === '完整 metadata 測試。',
        metadataValuesAligned: metadataValueLefts.length >= 3 && Math.max(...metadataValueLefts) - Math.min(...metadataValueLefts) <= 1,
        metadataValuesUsePrimaryText: metadataValues.every((value) => getComputedStyle(value).color === getComputedStyle(singleQuotePanel.querySelector('.al-moment-text')).color),
        noteUsesStackedLayout: singleNoteLabelRect.bottom <= singleNoteTextRect.top + 2 && Math.abs(singleNoteLabelRect.left - singleNoteTextRect.left) <= 1,
        shortNoteNotTruncated: singleNoteText.scrollHeight <= singleNoteText.clientHeight + 1 && getComputedStyle(singleNoteText).overflow !== 'hidden',
        twoImagesShareRow: twoRects.length === 2 && Math.abs(twoRects[0].top - twoRects[1].top) <= 1,
        longSingleHorizontalRow: longRows.length === 1,
        longHorizontalOverflow: longGallery.scrollWidth > longGallery.clientWidth + 20,
        longHorizontalScrolling: longGallery.scrollLeft > 0,
        nativeHorizontalScroller: getComputedStyle(longGallery).overflowX === 'auto' && getComputedStyle(longGallery).flexWrap === 'nowrap',
        imagesUseContain: [...longImages, ...singleGallery.querySelectorAll('img'), ...twoGallery.querySelectorAll('img')].every((image) => getComputedStyle(image).objectFit === 'contain'),
        longQuoteClamped: longContentOverflows && collapsedLongHeight < expandedLongHeight - 8,
        longQuoteExpandable: expandedLongHeight > collapsedLongHeight + 8 && longToggleVisibleWhenCollapsed && longToggleVisibleWhenExpanded,
        metadataNoteSharesExpansion: longMetadataOverflows
        ? expandedMetadataHeight > collapsedMetadataHeight + 8 && expandedNoteVisibleHeight >= collapsedNoteVisibleHeight && longMetadata.scrollHeight <= expandedMetadataHeight + 2
        : longNoteText.scrollHeight <= collapsedNoteVisibleHeight + 2 && getComputedStyle(longNoteText).overflow !== 'hidden',
        noLegacyIndexRail: document.querySelector('.al-moment-index') === null,
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
      const details = ${isMobile} ? {
        ...shared,
        mobileQuoteBeforeMetadata: longQuoteRect.top <= longMetadataRect.top + 1 && longQuoteRect.bottom <= longMetadataRect.top + 2,
        mobileContentSingleColumn: Math.abs(longQuoteRect.left - longContentRect.left) <= 2 && Math.abs(longMetadataRect.left - longContentRect.left) <= 2,
        mobileTwoImageRowScrollsWhenNeeded: twoGallery.scrollWidth >= twoGallery.clientWidth && getComputedStyle(twoGallery).flexWrap === 'nowrap',
      } : {
        ...shared,
        desktopMetadataLeftOfQuote: metadataRect.right <= singleQuoteRect.left + 2 && longMetadataRect.right <= longQuoteRect.left + 2,
        desktopMetadataNarrowerThanQuote: metadataRect.width < singleQuoteRect.width * 0.55 && longMetadataRect.width < longQuoteRect.width * 0.55,
        twoLandscapeFramesFitInitialViewport: twoRects.length === 2 && twoRects[0].left >= twoGalleryRect.left - 1 && twoRects[1].right <= twoGalleryRect.right + 1,
        twoLandscapeFramesUseSpace: twoVisibleWidth >= twoGalleryRect.width * 0.82,
        boundedCard: singleCard.getBoundingClientRect().width <= document.querySelector('#fixture').getBoundingClientRect().width + 1,
      };
      document.body.dataset.details = JSON.stringify(details);
      document.body.dataset.result = Object.values(details).every(Boolean) ? 'pass' : 'fail';
    } catch (error) { document.body.dataset.details = String(error?.stack || error); document.body.dataset.result = 'fail'; }
  </script></body></html>`;
}

async function imageSectionExpandFixture() {
  const anchorBundle = await build({
    stdin: {
      contents: `import { captureViewportAnchor } from "./src/ui/viewport-anchor.ts"; window.captureViewportAnchor = captureViewportAnchor;`,
      resolveDir: root,
      sourcefile: "image-section-anchor-fixture.ts",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
  });
  const anchorScript = anchorBundle.outputFiles[0].text;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root { --background-primary:#111; --background-secondary:#222; --background-modifier-border:#444; --interactive-accent:#7777dd; --text-normal:#eee; --text-muted:#aaa; }
    html,body{margin:0;width:100%;height:100%;overflow:hidden;} body{font-family:sans-serif;} ${styles}
    #editor-scroll{height:800px;overflow-y:auto}.spacer{height:900px}.tail{height:1400px}.al-image-item{height:180px}
  </style></head><body data-result="pending"><div id="editor-scroll" class="cm-scroller"><div class="spacer"></div>
    <section id="section" class="animelist-image-section">
      <div id="viewport" class="al-image-gallery-viewport"><div class="al-image-masonry">${'<div class="al-image-item"></div>'.repeat(14)}</div></div>
      <button id="toggle" class="al-image-expand-button" type="button">Show all images</button>
    </section><div class="tail"></div></div>
    <script>${anchorScript}</script>
    <script>
      const scroller = document.querySelector('#editor-scroll');
      const section = document.querySelector('#section');
      const viewport = document.querySelector('#viewport');
      const toggle = document.querySelector('#toggle');
      let editorMouseDown = false;
      scroller.addEventListener('mousedown', () => { editorMouseDown = true; });
      section.addEventListener('mousedown', (event) => {
        if (!event.target.closest('button, a, input, textarea, select, [role="button"]')) return;
        event.preventDefault();
        event.stopPropagation();
      });
      toggle.scrollIntoView({ block: 'center' });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const beforeTop = section.getBoundingClientRect().top;
        const beforeHeight = viewport.getBoundingClientRect().height;
        const anchor = window.captureViewportAnchor(section);
        toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        viewport.classList.add('is-expanded');
        anchor.restore();
        anchor.stabilize(12);
        requestAnimationFrame(() => {
          // Model the delayed scroll correction Live Preview/CodeMirror can apply
          // after a block widget changes height. The image section must undo this
          // without moving the user's visible anchor.
          scroller.scrollTop += 240;
        });
        let frames = 0;
        const check = () => {
          frames += 1;
          if (frames < 14) { requestAnimationFrame(check); return; }
          const afterTop = section.getBoundingClientRect().top;
          const afterHeight = viewport.getBoundingClientRect().height;
          const details = {
            sectionAnchorStable: Math.abs(afterTop - beforeTop) <= 1,
            contentExpandedDownward: afterHeight > beforeHeight + 100,
            editorMouseDownBlocked: !editorMouseDown,
          };
          document.body.dataset.details = JSON.stringify(details);
          document.body.dataset.result = Object.values(details).every(Boolean) ? 'pass' : 'fail';
        };
        requestAnimationFrame(check);
      }));
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
  await runChromiumDatasetTest({
    html: await imageSectionExpandFixture(),
    profile: path.join(output, "image-section-expand-profile"),
    testName: "AnimeList image section expansion anchor",
    viewport: { width: 1200, height: 800, mobile: false },
  });
  await runChromiumDatasetTest({
    html: momentsFilmstripFixture(false),
    profile: path.join(output, "moments-filmstrip-desktop-profile"),
    testName: "AnimeList moments desktop media-first cards",
    viewport: { width: 1200, height: 900, mobile: false },
  });
  await runChromiumDatasetTest({
    html: momentsFilmstripFixture(true),
    profile: path.join(output, "moments-filmstrip-mobile-profile"),
    testName: "AnimeList moments mobile media-first cards",
    viewport: { width: 390, height: 844, mobile: true },
  });
} finally {
  await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

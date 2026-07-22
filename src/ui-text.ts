import type { MediaType } from "./types";

/**
 * Single source of truth for every user-visible label, hint, validation message,
 * and notice in AnimeList. Change product wording here; UI modules must reference
 * these keys instead of embedding display strings.
 */
export const UI_TEXT = {
  "app.openLibrary": "開啟 AnimeList",
  "app.openTimeline": "開啟時間軸",
  "app.initializeLibrary": "建立收藏庫資料夾",

  "settings.intro": "AnimeList keeps media records in Markdown. These settings only control where notes, covers, and templates are stored and scanned.",
  "settings.storageLayout.name": "Storage layout",
  "settings.storageLayout.desc": "Managed mode creates Anime, Manga, and Novel subfolders. Flat mode writes every media note directly into one folder.",
  "settings.storageLayout.managed": "Managed library",
  "settings.storageLayout.flat": "Flat folder",
  "settings.libraryRoot.name": "Library root",
  "settings.libraryRoot.desc": "AnimeList creates Anime, Manga, Novel, Covers, and Templates below this folder. The default is AnimeList.",
  "settings.flatFolder.name": "Flat media folder",
  "settings.flatFolder.desc": "Media notes are created directly in this folder without Anime, Manga, or Novel subfolders. Leave blank to use the vault root.",
  "settings.additionalFolders.name": "Additional scan folders",
  "settings.additionalFolders.desc": "Optional existing folders to read without moving files. Enter one vault-relative path per line or separate paths with commas.",
  "settings.coverFolder.name": "Cover folder",
  "settings.coverFolder.desc": "Downloaded cover images are stored below this folder, grouped by media type.",
  "settings.templateFolder.name": "Template folder",
  "settings.templateFolder.desc": "Custom templates are read from Anime, Manga, Novel, and Common subfolders below this location.",
  "settings.providers.heading": "Metadata providers",
  "settings.provider.bangumi.desc": "Search anime, manga, and light novels. Useful for Chinese and Japanese titles.",
  "settings.provider.anilist.desc": "Search anime, manga, and light novels with structured metadata.",
  "settings.provider.openlibrary.desc": "Search general novels and books.",
  "settings.setup.heading": "Library setup",
  "settings.createFolders.name": "Create configured folders",
  "settings.createFolders.desc": "Creates missing note, cover, and template folders. Existing files are never moved or overwritten.",
  "settings.createFolders.button": "Create folders",
  "settings.createFolders.notice": "AnimeList folders are ready.",
  "settings.copyTemplates.name": "Copy default templates",
  "settings.copyTemplates.desc": "Writes the built-in Traditional Chinese templates into the configured template folder. Existing files are not overwritten.",
  "settings.copyTemplates.button": "Copy templates",
  "settings.copyTemplates.notice": "Default templates are ready.",

  "media.type.all": "全部",
  "media.type.anime": "動畫",
  "media.type.manga": "漫畫",
  "media.type.novel": "小說",
  "media.status.all": "所有",
  // Cross-media filters use one concise name. Edit these five values to choose
  // the common wording shown while the library is on the "全部" tab.
  "media.status.active": "進行中",
  "media.status.completed": "完成",
  "media.status.planned": "願望清單",
  "media.status.paused": "擱置",
  "media.status.dropped": "棄置",
  "media.status.watching": "追番中",
  "media.status.reading": "閱讀中",
  "media.status.completedAnime": "已完成",
  "media.status.completedReading": "已完成",
  "media.status.plannedAnime": "待追",
  "media.status.plannedReading": "待讀",
  "media.status.pausedAnime": "擱置",
  "media.status.droppedAnime": "棄番",
  "media.status.pausedReading": "擱置",
  "media.status.droppedReading": "棄讀",
  "media.unit.episode": "集",
  "media.unit.chapter": "話",
  "media.unit.volume": "卷",
  "media.unit.page": "頁",
  "media.unit.percent": "%",
  "media.format.tv": "TV 動畫",
  "media.format.movie": "動畫電影",
  "media.format.ova": "OVA",
  "media.format.ona": "ONA",
  "media.format.special": "特別篇",
  "media.format.music": "音樂動畫",
  "media.format.manga": "漫畫",
  "media.format.oneShot": "短篇漫畫",
  "media.format.manhwa": "韓漫",
  "media.format.manhua": "華語漫畫",
  "media.format.lightNovel": "輕小說",
  "media.format.novel": "小說",
  "media.provider.bangumi": "Bangumi",
  "media.provider.anilist": "AniList",
  "media.provider.openlibrary": "Open Library",
  "media.provider.manual": "手動建立",
  "media.release.releasing": "連載中",
  "media.release.finished": "已完結",
  "media.release.hiatus": "休載中",
  "media.release.cancelled": "已中止",
  "media.release.unknown": "出版狀態未知",
  "media.untitled": "未命名作品",

  "library.kicker": "PERSONAL MEDIA LIBRARY",
  "library.title": "收藏庫",
  "library.description": "以 Markdown 整理動畫、漫畫與小說收藏。",
  "library.timeline": "時間軸",
  "library.tabAll": "全部作品",
  "library.searchPlaceholder": "搜尋標題、原名、作者、工作室或分類…",
  "library.genreAll": "所有分類",
  "library.sort.completedDesc": "最近完成",
  "library.sort.completedAsc": "最早完成",
  "library.sort.updatedDesc": "最近更新",
  "library.sort.updatedAsc": "較早更新",
  "library.sort.scoreDesc": "評分由高至低",
  "library.sort.scoreAsc": "評分由低至高",
  "library.sort.startedDesc": "最近開始",
  "library.sort.startedAsc": "最早開始",
  "library.sort.yearDesc": "作品年份由新至舊",
  "library.sort.yearAsc": "作品年份由舊至新",
  "library.sort.progressDesc": "完成度由高至低",
  "library.sort.titleAsc": "依標題排列",
  "library.view.grid": "卡片",
  "library.view.list": "清單",
  "library.view.poster": "縮圖",
  "library.emptyTitle": "沒有符合條件的項目",
  "library.emptyDescription": "請調整分類、狀態或搜尋條件。",
  "library.resultAll": "全部作品",
  "library.resultMeta": "顯示 {shown}，共 {total} 部{genre}",
  "library.coverMissing": "尚未設定封面",
  "library.coverAlt": "{title} 封面",
  "library.favoriteAdd": "加入最愛",
  "library.favoriteRemove": "移出最愛",
  "library.unknownFormat": "作品",
  "library.startedAt": "開始於 {date}",
  "library.completedAt": "完成於 {date}",
  "library.updatedAt": "更新於 {date}",
  "library.unrated": "尚未留下評分",
  "library.notStarted": "尚未開始",
  "library.watchedProgress": "已看 {progress} {unit}",
  "library.readProgress": "已讀 {progress} {unit}",

  "timeline.title": "時間軸",
  "timeline.summary": "{count} 筆完成紀錄 · {start} 至 {end}",
  "timeline.summaryEmpty": "0 筆完成紀錄",
  "timeline.filterAll": "所有",
  "timeline.emptyTitle": "尚無完成紀錄",
  "timeline.emptyDescription": "完成作品後會顯示於此。",
  "timeline.spacingControls": "日期間距",
  "timeline.zoomOut": "縮短日期間距",
  "timeline.zoomIn": "拉開日期間距",
  "timeline.scaleControls": "畫面大小",
  "timeline.scaleOut": "縮小畫面",
  "timeline.scaleIn": "放大畫面",
  "timeline.scaleLabel": "畫面 {percent}%",
  "timeline.fit": "完整顯示",
  "timeline.zoomLabel": "{percent}% · 每日 {spacing} px",
  "timeline.volumeLabel": "第 {volume} 卷",
  "timeline.novelEventTitle": "{title} — 第 {volume} 卷",
  "timeline.cardTitle": "{title} · {date}",
  "timeline.coverAlt": "{title} 封面",

  "date.year": "年",
  "date.month": "月",
  "date.day": "日",

  "volume.title": "分卷紀錄",
  "volume.description": "卷數支援整數、.5、EX；新增卷預設今天完成。",
  "volume.add": "新增一卷",
  "volume.empty": "尚無分卷紀錄。",
  "volume.label": "卷數",
  "volume.labelPlaceholder": "例如 3、7.5、EX",
  "volume.startedAt": "開始日期",
  "volume.completedAt": "完成日期",
  "volume.completedHint": "未填時使用今天",

  "action.save": "儲存",
  "action.add": "新增",
  "action.remove": "移除",
  "action.delete": "刪除",
  "action.cancel": "取消",
  "action.edit": "編輯",
  "action.search": "搜尋",
  "action.back": "返回",
  "action.collect": "收錄",
  "action.select": "選用",

  "add.kicker": "ADD TO YOUR LIBRARY",
  "add.title": "收錄",
  "add.description": "選擇類型並搜尋作品。",
  "add.searching": "尋找中…",
  "add.loadMore": "載入更多",
  "add.loadingMore": "載入中…",
  "add.processing": "新增中…",
  "add.placeholderAnime": "例如：輝夜姬想讓人告白",
  "add.placeholderManga": "例如：葬送的芙莉蓮",
  "add.placeholderNovel": "例如：無職轉生、Norwegian Wood",
  "add.hintNovel": "輕小說會搜尋 Bangumi 與 AniList；一般小說也會一併搜尋 Open Library。",
  "add.hintMedia": "搜尋結果會合併 Bangumi 與 AniList；中文名稱通常較容易由 Bangumi 找到。",
  "add.warning": "部分資料來源暫時沒有回應：{warnings}",
  "add.emptyResult": "還沒有找到合適的結果。可以改用原文、日文或英文名稱再試一次。",
  "add.noCover": "No cover",
  "add.unknownYear": "年份不明",
  "add.titleLabel": "書架上的名稱",
  "add.required": "必填",
  "add.statusLabel": "目前狀態",
  "add.releaseStatusLabel": "日本原版出版狀態",
  "add.scoreLabel": "我的評分（0–10）",
  "add.scoreHint": "{status}時必填；其他狀態可留空。",
  "add.startedAt": "開始日期",
  "add.startedHint": "選填",
  "add.completedAt": "完成日期",
  "add.completedHint": "{status}時必填。",
  "add.progressAnime": "目前進度",
  "add.progressManga": "目前閱讀話數",
  "add.progressNovel": "目前閱讀卷數",
  "add.progressNovelHint": "支援整數、.5 與 EX。",
  "add.total": "作品總數",
  "add.unit": "進度單位",
  "add.genres": "分類",
  "add.genresHint": "可用逗號或頓號分隔；常見中英文分類會自動統一。",
  "add.template": "筆記模板",
  "add.templateHint": "模板直接讀取 Templates 資料夾；可自行新增或修改。",
  "add.noTemplate": "不套用模板",
  "add.favorite": "收進最愛",
  "add.sourceNovel": "作品封面會儲存到 vault；分卷紀錄只包含卷數與日期。",
  "add.sourceMedia": "封面會優先儲存到 vault，並保留資料來源。",

  "edit.title": "整理：{title}",
  "edit.description": "調整自己的進度、日期與評分；外部作品資料會保持原樣。",

  "delete.title": "刪除作品？",
  "delete.description": "「{title}」的 Markdown 筆記會移到系統垃圾桶；本地封面不會一併刪除。",

  "detail.favorite": "★ 最愛",
  "detail.favoriteAdd": "☆ 加入最愛",
  "detail.library": "回到收藏庫",
  "detail.source": "查看資料來源",
  "detail.noProgress": "尚未記錄進度",

  "completion.animeCompleted": "動畫標記為{status}時，進度會與總集數同步，且完成日期為必填。",
  "completion.animeActive": "動畫進度會依目前集數與總集數顯示。",
  "completion.readingCompleted": "漫畫與小說是否讀完只由狀態決定，不會根據話數或卷數自動判斷。",
  "completion.readingActive": "只記錄目前閱讀位置；開始與完成日期皆可留空。",
  "completion.requiredPlaceholder": "{status}時必填",
  "common.optional": "選填",
  "common.emptyValue": "（空白）",
  "common.sharedName": "{name}（共用）",
  "template.builtinPlain": "簡潔筆記（內建）",

  "field.score": "個人評分",
  "field.completedAt": "完成日期",
  "validation.titleRequired": "請輸入作品名稱。",
  "validation.completedFieldRequired": "{status}狀態必須填寫{field}",
  "validation.scoreRange": "個人評分必須是 0 到 10 之間的數字",
  "validation.volumeFormat": "{label}僅支援整數、.5 或 EX",
  "validation.volumeInvalid": "無效卷數：{value}。僅支援整數、.5 或 EX。",
  "validation.volumeDuplicate": "卷數 {volume} 重複。",
  "validation.mediaNoteMissing": "找不到作品筆記",

  "notice.searchQueryRequired": "先寫下作品名稱，再開始搜尋。",
  "notice.searchNoResults": "沒有找到相符作品，換個名稱再試一次。",
  "notice.searchUnavailable": "目前無法連上外部資料庫，請稍後再試。",
  "notice.collected": "已收錄：{title}",
  "notice.createFailed": "新增失敗：{error}",
  "notice.deleted": "作品已從收藏庫移除。",
  "notice.deleteFailed": "刪除失敗：{error}",
  "notice.saved": "已儲存。",
  "notice.saveFailed": "儲存失敗：{error}",
  "notice.mediaNoteMissing": "找不到這筆作品筆記。",
  "notice.favoriteAdded": "已收進最愛。",
  "notice.favoriteRemoved": "已從最愛中移除。",
  "notice.existingSource": "這筆外部資料已經在收藏庫中，已開啟原筆記。",
  "notice.existingMedia": "作品已存在，已開啟原筆記。",
  "notice.coverRemote": "封面無法存到本機，改用遠端圖片。"
} as const;

export type UiMediaType = "all" | MediaType;
export type UiStatusFilter = "all" | "active" | "completed" | "planned" | "on_hold" | "dropped";
export type UiTextKey = keyof typeof UI_TEXT;
export type UiTextVariables = Record<string, string | number>;

export function uiText(key: UiTextKey, variables: UiTextVariables = {}): string {
  const template = UI_TEXT[key];
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

export function completedStatusLabel(mediaType: MediaType): string {
  return uiText(mediaType === "anime" ? "media.status.completedAnime" : "media.status.completedReading");
}

export function mediaStatusLabel(status: string, mediaType: UiMediaType = "all"): string {
  if (mediaType === "anime") {
    if (status === "watching" || status === "active") return uiText("media.status.watching");
    if (status === "completed") return uiText("media.status.completedAnime");
    if (status === "planned") return uiText("media.status.plannedAnime");
    if (status === "on_hold") return uiText("media.status.pausedAnime");
    if (status === "dropped") return uiText("media.status.droppedAnime");
  } else if (mediaType === "manga" || mediaType === "novel") {
    if (status === "reading" || status === "active") return uiText("media.status.reading");
    if (status === "completed") return uiText("media.status.completedReading");
    if (status === "planned") return uiText("media.status.plannedReading");
    if (status === "on_hold") return uiText("media.status.pausedReading");
    if (status === "dropped") return uiText("media.status.droppedReading");
  }

  if (status === "active" || status === "watching" || status === "reading") return uiText("media.status.active");
  if (status === "completed") return uiText("media.status.completed");
  if (status === "planned") return uiText("media.status.planned");
  if (status === "on_hold") return uiText("media.status.paused");
  if (status === "dropped") return uiText("media.status.dropped");
  return status;
}

export function statusFilterOptions(mediaType: UiMediaType): Array<[UiStatusFilter, string]> {
  return [
    ["all", uiText("media.status.all")],
    ["active", mediaStatusLabel("active", mediaType)],
    ["completed", mediaStatusLabel("completed", mediaType)],
    ["planned", mediaStatusLabel("planned", mediaType)],
    ["on_hold", mediaStatusLabel("on_hold", mediaType)],
    ["dropped", mediaStatusLabel("dropped", mediaType)],
  ];
}

export function completedRequirementMessage(mediaType: MediaType, field: string): string {
  return uiText("validation.completedFieldRequired", {
    status: completedStatusLabel(mediaType),
    field,
  });
}

const FORMAT_KEYS = {
  tv: "media.format.tv",
  movie: "media.format.movie",
  ova: "media.format.ova",
  ona: "media.format.ona",
  special: "media.format.special",
  music: "media.format.music",
  manga: "media.format.manga",
  one_shot: "media.format.oneShot",
  manhwa: "media.format.manhwa",
  manhua: "media.format.manhua",
  light_novel: "media.format.lightNovel",
  novel: "media.format.novel",
} as const satisfies Record<string, UiTextKey>;

const PROVIDER_KEYS = {
  bangumi: "media.provider.bangumi",
  anilist: "media.provider.anilist",
  openlibrary: "media.provider.openlibrary",
  manual: "media.provider.manual",
} as const satisfies Record<string, UiTextKey>;

export function mediaFormatLabel(format: string): string {
  const key = FORMAT_KEYS[format as keyof typeof FORMAT_KEYS];
  return key ? uiText(key) : format;
}

export function mediaProviderLabel(provider: string): string {
  const key = PROVIDER_KEYS[provider as keyof typeof PROVIDER_KEYS];
  return key ? uiText(key) : provider;
}

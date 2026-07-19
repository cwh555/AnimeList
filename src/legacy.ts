// @ts-nocheck
import { MarkdownRenderChild, Modal, Notice, Plugin, requestUrl, normalizePath } from "obsidian";

const PLUGIN_VERSION = "1.0.1";
const MEDIA_ROOT = "Media";
const COVER_ROOT = "Assets/Covers";
const TEMPLATE_ROOT = "Templates";
const USER_AGENT = `AnimeList-Obsidian/${PLUGIN_VERSION} (local personal media library)`;

const LABEL = {
  type: { all: "全部", anime: "動畫", manga: "漫畫", novel: "小說" },
  status: {
    all: "所有狀態",
    active: "追番中",
    watching: "追番中",
    reading: "追番中",
    completed: "已完成",
    planned: "待追",
    on_hold: "棄番",
    dropped: "棄番", // legacy frontmatter is normalized to on_hold
  },
  unit: { episode: "集", chapter: "話", volume: "卷", page: "頁", percent: "%" },
  format: {
    tv: "TV 動畫", movie: "動畫電影", ova: "OVA", ona: "ONA", special: "特別篇", music: "音樂動畫",
    manga: "漫畫", one_shot: "短篇漫畫", manhwa: "韓漫", manhua: "華語漫畫",
    light_novel: "輕小說", novel: "小說",
  },
  provider: { bangumi: "Bangumi", anilist: "AniList", openlibrary: "Open Library", manual: "手動建立" },
};

const GENRE_ALIASES = new Map(Object.entries({
  "romance": "戀愛", "love": "戀愛", "恋爱": "戀愛", "戀愛": "戀愛", "爱情": "戀愛",
  "comedy": "喜劇", "喜剧": "喜劇", "喜劇": "喜劇", "搞笑": "喜劇",
  "fantasy": "奇幻", "奇幻": "奇幻", "魔法": "魔法",
  "adventure": "冒險", "冒险": "冒險", "冒險": "冒險",
  "action": "動作", "动作": "動作", "動作": "動作", "戰鬥": "動作", "战斗": "動作",
  "drama": "劇情", "剧情": "劇情", "劇情": "劇情",
  "slice of life": "日常", "slice-of-life": "日常", "日常": "日常",
  "school": "校園", "school life": "校園", "校园": "校園", "校園": "校園",
  "psychological": "心理", "心理": "心理", "心理戰": "心理",
  "mystery": "懸疑", "悬疑": "懸疑", "推理": "懸疑", "懸疑": "懸疑",
  "thriller": "驚悚", "惊悚": "驚悚", "驚悚": "驚悚",
  "horror": "恐怖", "恐怖": "恐怖",
  "sci-fi": "科幻", "science fiction": "科幻", "科幻": "科幻",
  "supernatural": "超自然", "超自然": "超自然",
  "sports": "運動", "运动": "運動", "運動": "運動",
  "music": "音樂", "音乐": "音樂", "音樂": "音樂",
  "historical": "歷史", "历史": "歷史", "歷史": "歷史",
  "mecha": "機器人", "機器人": "機器人", "机器人": "機器人",
  "isekai": "異世界", "异世界": "異世界", "異世界": "異世界",
  "healing": "療癒", "治癒": "療癒", "治愈": "療癒", "療癒": "療癒",
  "family": "家庭", "家庭": "家庭",
  "workplace": "職場", "职场": "職場", "職場": "職場",
  "food": "美食", "美食": "美食",
  "military": "軍事", "军事": "軍事", "軍事": "軍事",
  "crime": "犯罪", "犯罪": "犯罪",
  "girls love": "百合", "yuri": "百合", "百合": "百合",
  "boys love": "BL", "boy's love": "BL", "bl": "BL",
}));

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function numeric(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateValue(value) {
  if (!value) return 0;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatFileModifiedTime(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function sanitizePathPart(value, fallback = "untitled") {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#[\]^]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function slugify(value, fallback = "media") {
  return sanitizePathPart(value, fallback).toLocaleLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-") || fallback;
}

function normalizeComparable(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeGenre(value) {
  const clean = String(value || "").normalize("NFKC").trim().replace(/^#/, "");
  if (!clean) return "";
  const key = clean.toLocaleLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  return GENRE_ALIASES.get(key) || clean;
}

function normalizeGenres(values, limit = 12) {
  const output = [];
  const seen = new Set();
  for (const raw of asArray(values)) {
    const value = normalizeGenre(typeof raw === "string" ? raw : raw?.name);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function yamlScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(String(value ?? ""));
}

function yamlArray(lines, key, values) {
  const clean = asArray(values).map((value) => String(value || "").trim()).filter(Boolean);
  if (!clean.length) return;
  lines.push(`${key}:`);
  clean.forEach((value) => lines.push(`  - ${yamlScalar(value)}`));
}

function mapFormat(value, mediaType) {
  const format = String(value || "").toUpperCase();
  const map = { TV: "tv", TV_SHORT: "tv", MOVIE: "movie", OVA: "ova", ONA: "ona", SPECIAL: "special", MUSIC: "music", MANGA: "manga", ONE_SHOT: "one_shot", NOVEL: "light_novel" };
  if (map[format]) return map[format];
  if (mediaType === "anime") return "tv";
  if (mediaType === "manga") return "manga";
  return "novel";
}

function bangumiInfoboxValues(infobox, keys) {
  const wanted = new Set(keys.map((key) => String(key).toLocaleLowerCase()));
  const values = [];
  for (const row of asArray(infobox)) {
    if (!row || !wanted.has(String(row.key || "").toLocaleLowerCase())) continue;
    const raw = row.value;
    if (Array.isArray(raw)) {
      raw.forEach((entry) => values.push(typeof entry === "string" ? entry : entry?.v || entry?.k || ""));
    } else if (raw && typeof raw === "object") values.push(raw.v || raw.k || "");
    else values.push(raw || "");
  }
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

function normalizeBangumiSubject(subject, mediaType) {
  const originalTitle = String(subject?.name || "").trim();
  const localTitle = String(subject?.name_cn || originalTitle || "未命名作品").trim();
  const images = subject?.images || {};
  const people = mediaType === "anime"
    ? bangumiInfoboxValues(subject?.infobox, ["动画制作", "動畫製作", "制作", "製作"])
    : bangumiInfoboxValues(subject?.infobox, ["作者", "原作", "作画", "作畫"]);
  const platform = String(subject?.platform || "").trim();
  let format = mediaType === "anime" ? "tv" : mediaType === "manga" ? "manga" : "light_novel";
  if (/剧场|劇場|movie/i.test(platform)) format = "movie";
  else if (/ova/i.test(platform)) format = "ova";
  else if (/web|ona/i.test(platform)) format = "ona";
  const date = String(subject?.date || "");
  const total = mediaType === "anime" ? numeric(subject?.eps || subject?.total_episodes) : numeric(subject?.volumes || subject?.eps);
  const rawGenres = asArray(subject?.tags).slice(0, 16).map((tag) => typeof tag === "string" ? tag : tag?.name).filter(Boolean);
  return {
    provider: "bangumi", sourceId: String(subject?.id ?? ""), sourceUrl: subject?.id ? `https://bgm.tv/subject/${subject.id}` : "",
    mediaType, title: localTitle, originalTitle, romajiTitle: "", format, year: numeric(date.slice(0, 4), ""),
    coverUrl: images.large || images.common || images.medium || images.small || images.grid || "",
    genres: normalizeGenres(rawGenres), rawGenres, people, platforms: platform ? [platform] : [], total,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: String(subject?.summary || "").trim(), externalScore: numeric(subject?.rating?.score, null),
  };
}

function normalizeAniListMedia(media, selectedType) {
  const title = media?.title || {};
  const localTitle = String(title.english || title.romaji || title.native || "未命名作品").trim();
  const originalTitle = String(title.native || title.romaji || "").trim();
  const staff = asArray(media?.staff?.edges)
    .filter((edge) => /creator|story|art|author|original/i.test(String(edge?.role || "")))
    .map((edge) => edge?.node?.name?.native || edge?.node?.name?.full).filter(Boolean);
  const studios = asArray(media?.studios?.nodes).map((node) => node?.name).filter(Boolean);
  const mediaType = selectedType;
  const total = mediaType === "anime" ? numeric(media?.episodes) : mediaType === "manga" ? numeric(media?.chapters || media?.volumes) : numeric(media?.volumes);
  const rawGenres = asArray(media?.genres).slice(0, 12);
  return {
    provider: "anilist", sourceId: String(media?.id ?? ""),
    sourceUrl: String(media?.siteUrl || (media?.id ? `https://anilist.co/${mediaType === "anime" ? "anime" : "manga"}/${media.id}` : "")),
    mediaType, title: localTitle, originalTitle, romajiTitle: String(title.romaji || ""), format: mapFormat(media?.format, mediaType),
    year: numeric(media?.startDate?.year, ""), coverUrl: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || "",
    genres: normalizeGenres(rawGenres), rawGenres, people: mediaType === "anime" ? studios : staff, platforms: [], total,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: stripHtml(media?.description), externalScore: media?.averageScore == null ? null : numeric(media.averageScore) / 10,
  };
}

function normalizeOpenLibraryBook(book) {
  const key = String(book?.key || "").replace(/^\/works\//, "");
  const rawGenres = asArray(book?.subject).slice(0, 16);
  return {
    provider: "openlibrary", sourceId: key, sourceUrl: key ? `https://openlibrary.org/works/${key}` : "", mediaType: "novel",
    title: String(book?.title || "未命名作品"), originalTitle: String(book?.title || ""), romajiTitle: "", format: "novel",
    year: numeric(book?.first_publish_year, ""), coverUrl: book?.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false` : "",
    genres: normalizeGenres(rawGenres), rawGenres, people: asArray(book?.author_name).slice(0, 6), platforms: [], total: 0, unit: "page", summary: "", externalScore: null,
  };
}

function dedupeSearchResults(results) {
  const seenSource = new Set();
  const seenTitle = new Set();
  const output = [];
  for (const result of results) {
    const sourceKey = `${result.provider}:${result.sourceId}`;
    if (seenSource.has(sourceKey)) continue;
    seenSource.add(sourceKey);
    const titleKey = `${result.mediaType}:${normalizeComparable(result.title || result.originalTitle)}`;
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (titleKey) seenTitle.add(titleKey);
    output.push(result);
  }
  return output;
}

function stripTemplateFrontmatter(content) {
  const text = String(content || "").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return text;
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function applyTemplateVariables(content, context) {
  const values = {
    title: context.title || "",
    date: todayString(),
    time: currentTimeString(),
    original_title: context.originalTitle || "",
    media_type: context.mediaType || "",
    cover: context.cover || context.coverUrl || "",
    summary: context.summary || "",
    source_url: context.sourceUrl || "",
  };
  return String(content || "").replace(/\{\{\s*([a-zA-Z_]+)(?::[^}]*)?\s*\}\}/g, (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match);
}

function ensureDetailBlock(body, title) {
  const detail = "```animelist-detail\n```";
  let text = String(body || "").trim();
  if (!text) text = `# ${title}\n\n> Added on ${todayString()} at ${currentTimeString()}.`;
  if (text.includes("```animelist-detail")) return text;
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (headingIndex >= 0) lines.splice(headingIndex + 1, 0, "", detail);
  else lines.unshift(`# ${title}`, "", detail, "");
  return lines.join("\n");
}

function completedProgress(status, total, current) {
  const safeTotal = Math.max(0, numeric(total));
  return status === "completed" ? safeTotal : Math.max(0, numeric(current));
}

function buildMediaMarkdown(result, form, coverPath, templateContent = "") {
  const title = String(form.title || "").trim();
  const score = Number(form.score);
  const completedAt = String(form.completedAt || todayString()).trim();
  if (!title) throw new Error("作品名稱為必填欄位");
  if (form.score === "" || form.score == null || !Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error("個人評分必須是 0 到 10 之間的數字");
  }
  if (!completedAt) throw new Error("完成日期為必填欄位");
  const total = Math.max(0, numeric(form.total ?? result.total));
  const progress = completedProgress(form.status, total, form.progress);
  const genres = normalizeGenres(form.genres?.length ? form.genres : result.genres);
  const lines = ["---", "schema_version: 4"];
  lines.push(`title: ${yamlScalar(title)}`);
  if (result.originalTitle) lines.push(`title_original: ${yamlScalar(result.originalTitle)}`);
  if (result.romajiTitle && result.romajiTitle !== result.originalTitle) lines.push(`title_romaji: ${yamlScalar(result.romajiTitle)}`);
  lines.push(`media_type: ${yamlScalar(result.mediaType)}`);
  lines.push(`format: ${yamlScalar(result.format || result.mediaType)}`);
  lines.push(`status: ${yamlScalar(form.status || "planned")}`);
  lines.push(`progress: ${progress}`);
  lines.push(`progress_total: ${total}`);
  lines.push(`progress_unit: ${yamlScalar(form.unit || result.unit)}`);
  lines.push(`score: ${score}`);
  lines.push(`favorite: ${form.favorite === true ? "true" : "false"}`);
  if (result.year) lines.push(`year: ${numeric(result.year)}`);
  if (form.startedAt) lines.push(`started_at: ${yamlScalar(form.startedAt)}`);
  lines.push(`completed_at: ${yamlScalar(completedAt)}`);
  if (coverPath || result.coverUrl) lines.push(`cover: ${yamlScalar(coverPath || result.coverUrl)}`);
  if (result.coverUrl) lines.push(`cover_remote: ${yamlScalar(result.coverUrl)}`);
  yamlArray(lines, "genres", genres);
  const rawGenres = asArray(result.rawGenres).map(String).filter((value) => value && !genres.includes(value));
  yamlArray(lines, "source_genres", rawGenres);
  if (result.mediaType === "anime") yamlArray(lines, "studios", result.people); else yamlArray(lines, "authors", result.people);
  yamlArray(lines, "platforms", result.platforms);
  lines.push(`source_provider: ${yamlScalar(result.provider)}`);
  if (result.sourceId) lines.push(`source_id: ${yamlScalar(result.sourceId)}`);
  yamlArray(lines, "source_urls", result.sourceUrl ? [result.sourceUrl] : []);
  if (result.externalScore != null) lines.push(`source_score: ${numeric(result.externalScore)}`);
  if (form.templatePath) lines.push(`note_template: ${yamlScalar(form.templatePath)}`);
  lines.push("---", "");
  const applied = applyTemplateVariables(stripTemplateFrontmatter(templateContent), {
    title, originalTitle: result.originalTitle, mediaType: result.mediaType, cover: coverPath, coverUrl: result.coverUrl,
    summary: result.summary, sourceUrl: result.sourceUrl,
  });
  let body = ensureDetailBlock(applied, title);
  if (coverPath && !body.includes(coverPath)) body = body.replace(/(```animelist-detail\n```)/, `$1\n\n![[${coverPath}|260]]`);
  else if (!coverPath && result.coverUrl && !body.includes(result.coverUrl)) body = body.replace(/(```animelist-detail\n```)/, `$1\n\n![${title} 封面](${result.coverUrl})`);
  lines.push(body.trim(), "");
  return lines.join("\n");
}

function parseConfig(source) {
  const config = { source: MEDIA_ROOT };
  for (const line of String(source || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return config;
}

function itemStatusLabel(item) {
  if (item.status === "completed") return item.mediaType === "anime" ? "已看完" : "已讀完";
  return LABEL.status[item.status] || item.status;
}

function createEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function iconSvg(name) {
  const icons = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"></path><circle cx="3" cy="6" r="1"></circle><circle cx="3" cy="12" r="1"></circle><circle cx="3" cy="18" r="1"></circle></svg>',
    poster: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 11h8M8 15h5"></path></svg>',
    sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4"></path></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
    timeline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"></path><circle cx="7" cy="12" r="2"></circle><circle cx="17" cy="12" r="2"></circle><path d="M7 10V6M17 14v4"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"></path><path d="m10 14 11-11"></path><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"></path></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>',
    fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path></svg>',
  };
  return icons[name] || "";
}

export const AnimeListUI = (() => {
  const normalize = (item) => ({
    ...item,
    mediaType: String(item.mediaType || item.media_type || "").toLowerCase(),
    status: (() => {
      const value = String(item.status || "planned").toLowerCase();
      return value === "dropped" ? "on_hold" : value;
    })(),
    format: String(item.format || item.mediaType || item.media_type || "").toLowerCase(),
    progress: numeric(item.progress),
    total: numeric(item.total ?? item.progress_total),
    score: item.score === "" || item.score == null ? null : numeric(item.score, null),
    genres: normalizeGenres(item.genres),
    people: asArray(item.people).filter(Boolean),
    platforms: asArray(item.platforms).filter(Boolean),
    sourceUrls: asArray(item.sourceUrls || item.source_urls).filter(Boolean),
    favorite: item.favorite === true,
    updated: numeric(item.updated),
    startedAt: String(item.startedAt || item.started_at || ""),
    completedAt: String(item.completedAt || item.completed_at || ""),
  });

  const ratio = (item) => item.total > 0 ? Math.min(1, Math.max(0, item.progress / item.total)) : item.unit === "percent" ? Math.min(1, Math.max(0, item.progress / 100)) : 0;

  const progressText = (item) => {
    const unit = LABEL.unit[item.unit] || item.unit || "";
    if (item.total > 0) return `${item.progress} / ${item.total} ${unit}`;
    if (item.progress > 0) return `${item.progress} ${unit}`.trim();
    return "尚未開始";
  };

  const statusMatch = (item, filter) => {
    if (filter === "all") return true;
    if (filter === "active") return ["watching", "reading"].includes(item.status);
    return item.status === filter;
  };

  function renderLibrary(container, inputItems, adapters = {}) {
    container.innerHTML = "";
    const items = inputItems.map(normalize);
    const genres = [...new Set(items.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    const initialState = adapters.initialState || {};
    const initialView = ["grid", "list", "poster"].includes(initialState.view || adapters.initialView) ? (initialState.view || adapters.initialView) : "grid";
    const state = {
      type: ["all", "anime", "manga", "novel"].includes(initialState.type) ? initialState.type : "all",
      status: initialState.status || "all",
      genre: initialState.genre || "all",
      query: initialState.query || "",
      sort: initialState.sort || "completed-desc",
      view: initialView,
    };
    const openFile = adapters.openFile || (() => {});
    const addItem = adapters.addItem || null;
    const editItem = adapters.editItem || null;
    const toggleFavorite = adapters.toggleFavorite || null;
    const openTimeline = adapters.openTimeline || null;

    const shell = createEl("section", "al-shell");
    container.appendChild(shell);

    const header = createEl("header", "al-hero");
    const titleBlock = createEl("div", "al-hero-copy");
    titleBlock.append(
      createEl("div", "al-kicker", "PERSONAL MEDIA LIBRARY"),
      createEl("h1", "al-title", "我的收藏書架"),
      createEl("p", "al-desc", "以 Markdown 整理動畫、漫畫與小說收藏。"),
    );
    const headerRight = createEl("div", "al-hero-right");
    const stats = createEl("div", "al-stats");
    [["anime", "動畫"], ["manga", "漫畫"], ["novel", "小說"]].forEach(([key, label]) => {
      const stat = createEl("div", "al-stat");
      stat.append(createEl("strong", "al-stat-number", items.filter((x) => x.mediaType === key).length), createEl("span", "al-stat-label", label));
      stats.appendChild(stat);
    });
    headerRight.appendChild(stats);
    const headerActions = createEl("div", "al-hero-actions");
    if (openTimeline) {
      const timelineButton = createEl("button", "al-secondary-button");
      timelineButton.type = "button";
      timelineButton.innerHTML = `${iconSvg("timeline")}<span>時間軸</span>`;
      timelineButton.addEventListener("click", () => openTimeline());
      headerActions.appendChild(timelineButton);
    }
    if (addItem) {
      const addButton = createEl("button", "al-add-button");
      addButton.type = "button";
      addButton.innerHTML = `${iconSvg("plus")}<span>收錄作品</span>`;
      addButton.addEventListener("click", () => addItem(state.type === "all" ? "anime" : state.type));
      headerActions.appendChild(addButton);
    }
    headerRight.appendChild(headerActions);
    header.append(titleBlock, headerRight);
    shell.appendChild(header);

    const nav = createEl("nav", "al-type-tabs");
    const typeButtons = new Map();
    [["all", "全部作品"], ["anime", "動畫"], ["manga", "漫畫"], ["novel", "小說"]].forEach(([key, label]) => {
      const count = key === "all" ? items.length : items.filter((x) => x.mediaType === key).length;
      const button = createEl("button", `al-type-tab${key === state.type ? " is-active" : ""}`);
      button.type = "button";
      button.append(createEl("span", "", label), createEl("span", "al-tab-count", count));
      button.addEventListener("click", () => {
        state.type = key;
        typeButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        update();
      });
      typeButtons.set(key, button);
      nav.appendChild(button);
    });
    shell.appendChild(nav);

    const toolbar = createEl("div", "al-toolbar");
    const searchWrap = createEl("label", "al-search");
    const searchIcon = createEl("span", "al-icon");
    searchIcon.innerHTML = iconSvg("search");
    const searchInput = createEl("input");
    searchInput.type = "search";
    searchInput.placeholder = "搜尋標題、原名、作者、工作室或分類…";
    searchInput.value = state.query;
    searchInput.addEventListener("input", () => { state.query = searchInput.value.trim().toLocaleLowerCase(); update(); });
    searchWrap.append(searchIcon, searchInput);

    const genreWrap = createEl("label", "al-sort al-genre-filter");
    const genreSelect = createEl("select");
    [["all", "所有分類"], ...genres.map((genre) => [genre, genre])].forEach(([value, text]) => {
      const option = createEl("option", "", text);
      option.value = value;
      genreSelect.appendChild(option);
    });
    if (genres.includes(state.genre)) genreSelect.value = state.genre;
    else state.genre = "all";
    genreSelect.addEventListener("change", () => { state.genre = genreSelect.value; update(); });
    genreWrap.appendChild(genreSelect);

    const sortWrap = createEl("label", "al-sort");
    const sortIcon = createEl("span", "al-icon");
    sortIcon.innerHTML = iconSvg("sort");
    const sortSelect = createEl("select");
    [
      ["completed-desc", "最近完成"], ["completed-asc", "最早完成"],
      ["updated-desc", "最近更新"], ["updated-asc", "較早更新"], ["score-desc", "評分由高至低"], ["score-asc", "評分由低至高"],
      ["started-desc", "最近開始"], ["started-asc", "最早開始"],
      ["year-desc", "作品年份由新至舊"], ["year-asc", "作品年份由舊至新"], ["progress-desc", "完成度由高至低"], ["title-asc", "依標題排列"],
    ].forEach(([value, text]) => {
      const option = createEl("option", "", text);
      option.value = value;
      option.selected = value === state.sort;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    sortWrap.append(sortIcon, sortSelect);

    const views = createEl("div", "al-view-switch");
    const viewButtons = new Map();
    [["grid", "grid", "卡片"], ["list", "list", "清單"], ["poster", "poster", "縮圖"]].forEach(([key, icon, label]) => {
      const button = createEl("button", `al-view-button${key === state.view ? " is-active" : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = iconSvg(icon);
      button.addEventListener("click", () => {
        state.view = key;
        if (adapters.onViewChange) adapters.onViewChange(key);
        viewButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        update();
      });
      viewButtons.set(key, button);
      views.appendChild(button);
    });
    toolbar.append(searchWrap, genreWrap, sortWrap, views);
    shell.appendChild(toolbar);

    const statusBar = createEl("div", "al-status-bar");
    const statusButtons = new Map();
    [["all", "全部"], ["active", "追番中"], ["completed", "已完成"], ["planned", "待追"], ["on_hold", "棄番"]].forEach(([key, label]) => {
      const button = createEl("button", `al-status-chip${key === state.status ? " is-active" : ""}`, label);
      button.type = "button";
      button.addEventListener("click", () => {
        state.status = key;
        statusButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        update();
      });
      statusButtons.set(key, button);
      statusBar.appendChild(button);
    });
    shell.appendChild(statusBar);

    const resultHead = createEl("div", "al-result-head");
    const resultTitle = createEl("strong", "al-result-title");
    const resultMeta = createEl("span", "al-result-meta");
    resultHead.append(resultTitle, resultMeta);
    shell.appendChild(resultHead);
    const grid = createEl("div", "al-grid is-grid");
    shell.appendChild(grid);

    const makeCard = (item) => {
      const card = createEl("article", `al-card status-${item.status}`);
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.addEventListener("click", () => openFile(item.filePath));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFile(item.filePath); }
      });

      const media = createEl("div", "al-cover-wrap");
      if (item.cover) {
        const image = createEl("img", "al-cover");
        image.src = item.cover;
        image.alt = `${item.title} 封面`;
        image.loading = "lazy";
        media.appendChild(image);
      } else {
        const missing = createEl("div", "al-cover-missing");
        const icon = createEl("span", "al-icon-large");
        icon.innerHTML = iconSvg("book");
        missing.append(icon, createEl("span", "", "尚未設定封面"));
        media.appendChild(missing);
      }
      media.appendChild(createEl("div", "al-cover-shade"));
      const top = createEl("div", "al-cover-top");
      const badges = createEl("div", "al-cover-badges");
      badges.appendChild(createEl("span", "al-format-badge", `${LABEL.type[item.mediaType] || item.mediaType} · ${item.year || "—"}`));
      if (item.score != null) badges.appendChild(createEl("span", "al-score-badge", `★ ${item.score.toFixed(1)}`));
      top.appendChild(badges);
      const topActions = createEl("div", "al-card-top-actions");
      if (toggleFavorite) {
        const favoriteButton = createEl("button", `al-favorite-button${item.favorite ? " is-active" : ""}`, item.favorite ? "★" : "☆");
        favoriteButton.type = "button";
        favoriteButton.title = item.favorite ? "移出最愛" : "加入最愛";
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
        favoriteButton.setAttribute("aria-pressed", item.favorite ? "true" : "false");
        favoriteButton.addEventListener("click", async (event) => {
          event.preventDefault(); event.stopPropagation(); favoriteButton.disabled = true;
          try { await toggleFavorite(item.filePath, !item.favorite); }
          finally { favoriteButton.disabled = false; }
        });
        topActions.appendChild(favoriteButton);
      }
      if (editItem) {
        const editButton = createEl("button", "al-edit-button");
        editButton.type = "button";
        editButton.title = "整理這筆紀錄";
        editButton.setAttribute("aria-label", editButton.title);
        editButton.innerHTML = iconSvg("edit");
        editButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); editItem(item.filePath); });
        topActions.appendChild(editButton);
      }
      top.appendChild(topActions);
      media.appendChild(top);
      const bottom = createEl("div", "al-cover-bottom");
      bottom.append(createEl("span", `al-status status-${item.status}`, itemStatusLabel(item)), createEl("span", "al-progress-on-cover", progressText(item)));
      media.appendChild(bottom);

      const body = createEl("div", "al-card-body");
      body.appendChild(createEl("h2", "al-card-title", item.title));
      if (item.originalTitle) body.appendChild(createEl("div", "al-original-title", item.originalTitle));
      const facts = createEl("div", "al-facts");
      facts.appendChild(createEl("span", "", LABEL.format[item.format] || item.format || "作品"));
      if (item.people.length) facts.appendChild(createEl("span", "", item.people.slice(0, 2).join("、")));
      body.appendChild(facts);
      if (item.startedAt || item.completedAt) {
        const dates = createEl("div", "al-date-row");
        if (item.startedAt) dates.appendChild(createEl("span", "", `開始於 ${item.startedAt}`));
        if (item.completedAt) dates.appendChild(createEl("span", "", `完成於 ${item.completedAt}`));
        body.appendChild(dates);
      }
      if (item.genres.length) {
        const tags = createEl("div", "al-tags");
        item.genres.slice(0, 4).forEach((genre) => tags.appendChild(createEl("span", "al-tag", genre)));
        body.appendChild(tags);
      }
      const progress = createEl("div", "al-progress");
      const bar = createEl("div", "al-progress-track");
      const fill = createEl("div", "al-progress-fill");
      fill.style.width = `${Math.round(ratio(item) * 100)}%`;
      bar.appendChild(fill);
      const progressRow = createEl("div", "al-progress-row");
      progressRow.append(createEl("span", "", progressText(item)), createEl("span", "", `${Math.round(ratio(item) * 100)}%`));
      progress.append(bar, progressRow);
      body.appendChild(progress);
      const footer = createEl("div", "al-card-footer");
      footer.append(createEl("span", "al-updated", item.updatedLabel || ""), createEl("span", "al-score", item.score == null ? "尚未留下評分" : `★ ${item.score.toFixed(1)}`));
      body.appendChild(footer);
      card.append(media, body);
      return card;
    };

    function update() {
      const query = state.query;
      let filtered = items.filter((item) => {
        if (state.type !== "all" && item.mediaType !== state.type) return false;
        if (!statusMatch(item, state.status)) return false;
        if (state.genre !== "all" && !item.genres.includes(state.genre)) return false;
        if (!query) return true;
        return [item.title, item.originalTitle, item.format, ...item.genres, ...item.people, ...item.platforms].join(" ").toLocaleLowerCase().includes(query);
      });
      const missingLast = (value, direction) => value ? value : direction > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
      const sorters = {
        "updated-desc": (a, b) => b.updated - a.updated,
        "updated-asc": (a, b) => a.updated - b.updated,
        "score-desc": (a, b) => (b.score ?? -1) - (a.score ?? -1),
        "score-asc": (a, b) => (a.score ?? Number.MAX_SAFE_INTEGER) - (b.score ?? Number.MAX_SAFE_INTEGER),
        "started-desc": (a, b) => missingLast(parseDateValue(b.startedAt), -1) - missingLast(parseDateValue(a.startedAt), -1),
        "started-asc": (a, b) => missingLast(parseDateValue(a.startedAt), 1) - missingLast(parseDateValue(b.startedAt), 1),
        "completed-desc": (a, b) => missingLast(parseDateValue(b.completedAt), -1) - missingLast(parseDateValue(a.completedAt), -1),
        "completed-asc": (a, b) => missingLast(parseDateValue(a.completedAt), 1) - missingLast(parseDateValue(b.completedAt), 1),
        "year-desc": (a, b) => numeric(b.year) - numeric(a.year),
        "year-asc": (a, b) => numeric(a.year) - numeric(b.year),
        "title-asc": (a, b) => a.title.localeCompare(b.title, "zh-Hant"),
        "progress-desc": (a, b) => ratio(b) - ratio(a),
      };
      filtered.sort(sorters[state.sort] || sorters["completed-desc"]);
      resultTitle.textContent = state.type === "all" ? "全部作品" : LABEL.type[state.type];
      const genreSuffix = state.genre === "all" ? "" : ` · ${state.genre}`;
      resultMeta.textContent = `顯示 ${filtered.length} / ${items.length} 部${genreSuffix}`;
      grid.className = `al-grid is-${state.view}`;
      grid.innerHTML = "";
      if (!filtered.length) {
        const empty = createEl("div", "al-empty");
        const icon = createEl("span", "al-empty-icon");
        icon.innerHTML = iconSvg("book");
        empty.append(icon, createEl("strong", "", "這一頁暫時沒有作品"), createEl("span", "", "換個分類、狀態或搜尋詞，也許就能再次遇見它。"));
        grid.appendChild(empty);
        return;
      }
      filtered.forEach((item) => grid.appendChild(makeCard(item)));
      if (adapters.onStateChange) adapters.onStateChange({ ...state });
    }

    update();
  }

  return { renderLibrary };
})();

export const TimelineUI = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_DAY_SPACING = 0.18;
  const MAX_DAY_SPACING = 96;
  const dayStart = (value) => {
    const time = parseDateValue(value);
    if (!time) return 0;
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const formatDate = (time) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const initialDaySpacing = (rangeDays) => {
    if (rangeDays <= 21) return 34;
    if (rangeDays <= 60) return 18;
    if (rangeDays <= 120) return 11;
    if (rangeDays <= 365) return 6;
    if (rangeDays <= 730) return 3.5;
    if (rangeDays <= 1825) return 2;
    return 1.15;
  };
  const tickStepForSpacing = (spacing) => {
    const candidates = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730];
    return candidates.find((step) => step * spacing >= 88) || 1460;
  };

  function render(container, inputItems, adapters = {}) {
    container.replaceChildren();
    const items = inputItems
      .map((item) => ({ ...item, completedTime: dayStart(item.completedAt || item.completed_at) }))
      .filter((item) => String(item.status || "completed") === "completed" && item.completedTime)
      .sort((a, b) => a.completedTime - b.completedTime || String(a.title).localeCompare(String(b.title), "zh-Hant"));
    if (!items.length) {
      const empty = createEl("div", "al-timeline-empty");
      empty.innerHTML = `${iconSvg("timeline")}<strong>時間軸還沒有留下足跡</strong><span>完成作品後，它會依完成日期出現在這裡。</span>`;
      container.appendChild(empty);
      return { items: 0 };
    }

    const grouped = new Map();
    for (const item of items) {
      const key = item.completedTime;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const dates = [...grouped.keys()].sort((a, b) => a - b);
    const minTime = dates[0];
    const maxTime = dates[dates.length - 1];
    const rangeDays = Math.max(1, Math.round((maxTime - minTime) / DAY_MS));
    const sidePadding = 170;
    const maxStack = Math.max(...[...grouped.values()].map((group) => group.length));
    const axisY = Math.max(360, 175 + maxStack * 128);
    const sceneHeight = axisY + 260;
    const baseSpacing = initialDaySpacing(rangeDays);
    const state = { x: 0, y: 0, daySpacing: baseSpacing, sceneWidth: 0 };

    const root = createEl("div", "al-timeline-root");
    const toolbar = createEl("div", "al-timeline-toolbar");
    const copy = createEl("div", "al-timeline-copy");
    copy.append(createEl("strong", "", "時間軸"), createEl("span", "", `${items.length} 部作品 · ${formatDate(minTime)} 至 ${formatDate(maxTime)}`));
    const controls = createEl("div", "al-timeline-controls");
    const zoomOut = createEl("button", "", "");
    zoomOut.type = "button"; zoomOut.title = "縮短日期間距"; zoomOut.innerHTML = iconSvg("minus");
    const zoomLabel = createEl("span", "al-timeline-zoom", "100%");
    const zoomIn = createEl("button", "", "");
    zoomIn.type = "button"; zoomIn.title = "拉開日期間距"; zoomIn.innerHTML = iconSvg("plus");
    const fit = createEl("button", "", "");
    fit.type = "button"; fit.title = "完整顯示"; fit.innerHTML = iconSvg("fit");
    controls.append(zoomOut, zoomLabel, zoomIn, fit);
    toolbar.append(copy, controls);
    root.appendChild(toolbar);

    const viewport = createEl("div", "al-timeline-viewport");
    const scene = createEl("div", "al-timeline-scene");
    viewport.appendChild(scene);
    root.appendChild(viewport);
    container.appendChild(root);
    const openFile = adapters.openFile || (() => {});

    const applyPan = () => {
      scene.style.transform = `translate(${state.x}px, ${state.y}px)`;
      zoomLabel.textContent = `${Math.round((state.daySpacing / baseSpacing) * 100)}% · ${state.daySpacing.toFixed(state.daySpacing < 10 ? 1 : 0)} px/日`;
    };

    const renderGeometry = () => {
      scene.replaceChildren();
      const viewportWidth = Math.max(720, viewport.clientWidth || 1200);
      state.sceneWidth = Math.max(viewportWidth, sidePadding * 2 + rangeDays * state.daySpacing);
      scene.style.width = `${state.sceneWidth}px`;
      scene.style.height = `${sceneHeight}px`;

      const axis = createEl("div", "al-timeline-axis");
      axis.style.left = `${sidePadding}px`;
      axis.style.top = `${axisY}px`;
      axis.style.width = `${Math.max(1, rangeDays * state.daySpacing)}px`;
      scene.appendChild(axis);

      const tickStep = tickStepForSpacing(state.daySpacing);
      for (let day = 0; day <= rangeDays; day += tickStep) {
        const tick = createEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + day * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(createEl("span", "", formatDate(minTime + day * DAY_MS)));
        scene.appendChild(tick);
      }
      if (rangeDays % tickStep !== 0) {
        const tick = createEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + rangeDays * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(createEl("span", "", formatDate(maxTime)));
        scene.appendChild(tick);
      }

      dates.forEach((time) => {
        const group = grouped.get(time);
        const x = sidePadding + Math.round((time - minTime) / DAY_MS) * state.daySpacing;
        const dayMarker = createEl("div", "al-timeline-day-marker");
        dayMarker.style.left = `${x - 5}px`;
        dayMarker.style.top = `${axisY - 5}px`;
        scene.appendChild(dayMarker);
        group.forEach((item, index) => {
          const cardY = axisY - 152 - index * 128;
          const stem = createEl("div", "al-timeline-stem");
          stem.style.left = `${x}px`;
          stem.style.top = `${cardY + 112}px`;
          stem.style.height = `${axisY - (cardY + 112)}px`;
          scene.appendChild(stem);
          const card = createEl("button", "al-timeline-card");
          card.type = "button";
          card.style.left = `${x - 54}px`;
          card.style.top = `${cardY}px`;
          card.title = `${item.title} · ${formatDate(time)}`;
          if (item.cover) {
            const image = createEl("img", "", "");
            image.src = item.cover;
            image.alt = `${item.title} 封面`;
            card.appendChild(image);
          }
          const text = createEl("span", "al-timeline-card-copy");
          text.append(createEl("strong", "", item.title), createEl("small", "", formatDate(time)));
          card.appendChild(text);
          if (item.score != null) card.appendChild(createEl("span", "al-timeline-score", `★ ${Number(item.score).toFixed(1)}`));
          card.addEventListener("click", () => openFile(item.filePath));
          scene.appendChild(card);
        });
      });
      applyPan();
    };

    const setDaySpacingAt = (nextSpacing, clientX) => {
      const rect = viewport.getBoundingClientRect();
      const localX = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
      const previous = state.daySpacing;
      const next = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, nextSpacing));
      if (Math.abs(next - previous) < 1e-6) return;
      const dayAtCursor = ((localX - state.x) - sidePadding) / previous;
      state.daySpacing = next;
      renderGeometry();
      state.x = localX - (sidePadding + dayAtCursor * next);
      applyPan();
    };

    const fitScene = () => {
      const availableWidth = Math.max(260, viewport.clientWidth - sidePadding * 2);
      state.daySpacing = Math.min(MAX_DAY_SPACING, Math.max(MIN_DAY_SPACING, availableWidth / rangeDays));
      renderGeometry();
      state.x = (viewport.clientWidth - state.sceneWidth) / 2;
      state.y = (viewport.clientHeight - sceneHeight) / 2;
      applyPan();
    };

    zoomIn.addEventListener("click", () => setDaySpacingAt(state.daySpacing * 1.25, viewport.getBoundingClientRect().left + viewport.clientWidth / 2));
    zoomOut.addEventListener("click", () => setDaySpacingAt(state.daySpacing / 1.25, viewport.getBoundingClientRect().left + viewport.clientWidth / 2));
    fit.addEventListener("click", fitScene);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) setDaySpacingAt(state.daySpacing * Math.exp(-event.deltaY * 0.002), event.clientX);
      else {
        state.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0);
        state.y -= event.shiftKey ? 0 : event.deltaY;
        applyPan();
      }
    }, { passive: false });

    let dragging = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".al-timeline-card")) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      state.x = dragging.startX + event.clientX - dragging.x;
      state.y = dragging.startY + event.clientY - dragging.y;
      applyPan();
    });
    const stopDrag = (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      viewport.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);

    renderGeometry();
    window.setTimeout(fitScene, 0);
    return {
      items: items.length,
      fitScene,
      getDaySpacing: () => state.daySpacing,
      getSceneWidth: () => state.sceneWidth,
    };
  }

  return { render };
})();

function createLabeledField(parent, labelText, input, hintText = "") {
  const wrapper = document.createElement("label");
  wrapper.className = "al-form-field";
  const label = document.createElement("span");
  label.className = "al-form-label";
  label.textContent = labelText;
  wrapper.append(label, input);
  if (hintText) wrapper.appendChild(createEl("small", "al-form-hint", hintText));
  parent.appendChild(wrapper);
  return input;
}

function createTextInput(type = "text", value = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  return input;
}

function createSelect(options, selected) {
  const select = document.createElement("select");
  options.forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selected;
    select.appendChild(option);
  });
  return select;
}

function bindCompletionBehavior(status, total, progress, completedAt, noteEl = null) {
  const sync = () => {
    const completed = status.value === "completed";
    progress.readOnly = completed;
    progress.classList.toggle("is-auto", completed);
    if (completed) {
      progress.value = String(Math.max(0, numeric(total.value)));
      if (completedAt && !completedAt.value) completedAt.value = todayString();
    }
    if (noteEl) {
      noteEl.textContent = completed
        ? "選為已完成時，進度會與總數同步，避免留下互相矛盾的紀錄。"
        : "進度可依目前觀看或閱讀的位置調整。";
    }
  };
  status.addEventListener("change", sync);
  total.addEventListener("input", sync);
  sync();
  return sync;
}

function genreInputValues(input) {
  return normalizeGenres(String(input?.value || "").split(/[、,，;；\n]+/));
}

class AddMediaModal extends Modal {
  constructor(plugin, initialType = "anime") {
    super(plugin.app);
    this.plugin = plugin;
    this.mediaType = ["anime", "manga", "novel"].includes(initialType) ? initialType : "anime";
    this.query = "";
    this.results = [];
    this.warnings = [];
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal");
    this.renderSearch();
  }

  renderSearch() {
    this.contentEl.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "al-modal-heading";
    heading.innerHTML = `<div><div class="al-kicker">ADD TO YOUR LIBRARY</div><h2>把作品收進書架</h2><p>選擇類型，再輸入名稱；封面、原名與資料連結會一併整理好。</p></div>`;
    this.contentEl.appendChild(heading);

    const typeTabs = document.createElement("div");
    typeTabs.className = "al-modal-type-tabs";
    [["anime", "動畫"], ["manga", "漫畫"], ["novel", "小說"]].forEach(([value, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `al-modal-type${this.mediaType === value ? " is-active" : ""}`;
      button.textContent = text;
      button.addEventListener("click", () => {
        this.mediaType = value;
        this.results = [];
        this.warnings = [];
        this.renderSearch();
      });
      typeTabs.appendChild(button);
    });
    this.contentEl.appendChild(typeTabs);

    const searchRow = document.createElement("div");
    searchRow.className = "al-modal-search-row";
    const input = createTextInput("search", this.query);
    input.placeholder = this.mediaType === "anime" ? "例如：輝夜姬想讓人告白" : this.mediaType === "manga" ? "例如：葬送的芙莉蓮" : "例如：無職轉生／Norwegian Wood";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mod-cta";
    button.textContent = "開始搜尋";
    const runSearch = () => {
      this.query = input.value.trim();
      if (!this.query) { new Notice("先寫下作品名稱，再開始搜尋。"); return; }
      this.search(button);
    };
    button.addEventListener("click", runSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
    searchRow.append(input, button);
    this.contentEl.appendChild(searchRow);

    const hint = document.createElement("p");
    hint.className = "al-modal-hint";
    hint.textContent = this.mediaType === "novel"
      ? "輕小說會搜尋 Bangumi／AniList；一般小說也會一併搜尋 Open Library。"
      : "搜尋結果會合併 Bangumi 與 AniList；中文名稱通常較容易由 Bangumi 找到。";
    this.contentEl.appendChild(hint);

    if (this.warnings.length) {
      const warning = document.createElement("div");
      warning.className = "al-modal-warning";
      warning.textContent = `部分資料來源暫時沒有回應：${this.warnings.join("；")}`;
      this.contentEl.appendChild(warning);
    }

    const resultsEl = document.createElement("div");
    resultsEl.className = "al-search-results";
    if (!this.results.length && this.query) {
      const empty = document.createElement("div");
      empty.className = "al-search-empty";
      empty.textContent = "還沒有找到合適的結果。可以改用原文、日文或英文名稱再試一次。";
      resultsEl.appendChild(empty);
    }
    this.results.forEach((result) => resultsEl.appendChild(this.createResultRow(result)));
    this.contentEl.appendChild(resultsEl);
    window.setTimeout(() => input.focus(), 0);
  }

  async search(button) {
    button.disabled = true;
    button.textContent = "尋找中…";
    try {
      const response = await this.plugin.searchExternal(this.mediaType, this.query);
      this.results = response.results;
      this.warnings = response.warnings;
      if (!this.results.length) new Notice("沒有找到相符作品，換個名稱再試一次。" );
    } catch (error) {
      console.error("AnimeList external search failed", error);
      this.results = [];
      this.warnings = [error?.message || String(error)];
      new Notice("目前無法連上外部資料庫，請稍後再試。" );
    }
    this.renderSearch();
  }

  createResultRow(result) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "al-search-result";
    if (result.coverUrl) {
      const image = document.createElement("img");
      image.src = result.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      row.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "al-search-result-placeholder";
      placeholder.textContent = "NO COVER";
      row.appendChild(placeholder);
    }
    const body = document.createElement("div");
    body.className = "al-search-result-body";
    const title = document.createElement("strong");
    title.textContent = result.title;
    const original = document.createElement("span");
    original.textContent = result.originalTitle || result.romajiTitle || "";
    const meta = document.createElement("span");
    meta.textContent = [LABEL.provider[result.provider], result.year || "年份不明", LABEL.format[result.format] || result.format].filter(Boolean).join(" · ");
    body.append(title, original, meta);
    const use = document.createElement("span");
    use.className = "al-search-result-use";
    use.textContent = "選用";
    row.append(body, use);
    row.addEventListener("click", () => this.renderDetails(result));
    return row;
  }

  async renderDetails(result) {
    this.contentEl.replaceChildren();
    const back = document.createElement("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = "← 回到搜尋結果";
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const preview = document.createElement("div");
    preview.className = "al-selected-preview";
    if (result.coverUrl) {
      const image = document.createElement("img");
      image.src = result.coverUrl;
      image.alt = `${result.title} 封面`;
      preview.appendChild(image);
    }
    const copy = document.createElement("div");
    copy.innerHTML = `<div class="al-kicker">${LABEL.provider[result.provider] || result.provider}</div><h2></h2><p></p>`;
    copy.querySelector("h2").textContent = result.title;
    copy.querySelector("p").textContent = result.originalTitle || result.romajiTitle || "";
    preview.appendChild(copy);
    this.contentEl.appendChild(preview);

    const templates = await this.plugin.getTemplates(result.mediaType);
    const form = document.createElement("div");
    form.className = "al-media-form";
    const titleInput = createLabeledField(form, "書架上的名稱", createTextInput("text", result.title), "必填");
    titleInput.required = true;
    const statusOptions = result.mediaType === "anime"
      ? [["planned", "待追"], ["watching", "追番中"], ["completed", "已看完"], ["on_hold", "棄番"]]
      : [["planned", "待追"], ["reading", "追番中"], ["completed", "已讀完"], ["on_hold", "棄番"]];
    const status = createLabeledField(form, "目前狀態", createSelect(statusOptions, "planned"));
    const score = createLabeledField(form, "我的評分（0–10）", createTextInput("number", ""), "必填；可輸入一位小數。");
    score.min = "0"; score.max = "10"; score.step = "0.1"; score.required = true;
    const startedAt = createLabeledField(form, "開始日期", createTextInput("date", ""));
    const completedAt = createLabeledField(form, "完成日期", createTextInput("date", todayString()), "必填；預設為今天，可自行調整。");
    completedAt.required = true;
    const progress = createLabeledField(form, "目前進度", createTextInput("number", "0"));
    progress.min = "0"; progress.step = "1";
    const total = createLabeledField(form, "作品總數", createTextInput("number", result.total || "0"));
    total.min = "0"; total.step = "1";
    const unitOptions = result.mediaType === "anime"
      ? [["episode", "集"]]
      : result.mediaType === "manga" ? [["chapter", "話"], ["volume", "卷"]] : [["volume", "卷"], ["page", "頁"], ["percent", "%"]];
    const unit = createLabeledField(form, "進度單位", createSelect(unitOptions, result.unit));
    const genreInput = createLabeledField(form, "分類", createTextInput("text", normalizeGenres(result.genres).join("、")), "可用逗號或頓號分隔；常見中英文分類會自動統一。" );
    const templateOptions = templates.length
      ? templates.map((template) => [template.path, template.name])
      : [["", "不套用模板"]];
    const templateSelect = createLabeledField(form, "筆記模板", createSelect(templateOptions, templateOptions[0][0]), "模板直接讀取 Templates 資料夾；可自行新增或修改。" );
    const completionNote = createEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote);
    const favoriteWrap = document.createElement("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = document.createElement("input");
    favorite.type = "checkbox";
    favoriteWrap.append(favorite, document.createTextNode(" 收進最愛"));
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const sourceNote = document.createElement("div");
    sourceNote.className = "al-source-note";
    sourceNote.textContent = "封面會優先保存到 Vault；外部資料連結與原始分類也會保留，方便日後核對。";
    this.contentEl.appendChild(sourceNote);

    const actions = document.createElement("div");
    actions.className = "al-modal-actions";
    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.className = "mod-cta";
    createButton.textContent = "建立作品筆記";
    createButton.addEventListener("click", async () => {
      if (!titleInput.value.trim()) { new Notice("請替這筆收藏留下一個名稱。" ); return; }
      const scoreValue = Number(score.value);
      if (score.value === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 10) { new Notice("請填入 0 到 10 之間的個人評分。" ); return; }
      if (!completedAt.value) { new Notice("請填入完成日期。" ); return; }
      createButton.disabled = true;
      createButton.textContent = "整理中…";
      try {
        const file = await this.plugin.createMediaNote(result, {
          title: titleInput.value.trim(), status: status.value, score: score.value,
          startedAt: startedAt.value, completedAt: completedAt.value,
          progress: progress.value, total: total.value, unit: unit.value,
          favorite: favorite.checked, genres: genreInputValues(genreInput), templatePath: templateSelect.value,
        });
        this.close();
        new Notice(`已收錄：${titleInput.value.trim()}`);
        await this.plugin.app.workspace.openLinkText(file.path, "", false);
      } catch (error) {
        console.error("AnimeList create note failed", error);
        new Notice(`建立失敗：${error?.message || error}`);
        createButton.disabled = false;
        createButton.textContent = "建立作品筆記";
      }
    });
    actions.appendChild(createButton);
    this.contentEl.appendChild(actions);
  }
}

class ConfirmDeleteModal extends Modal {
  constructor(plugin, file, onDeleted = null) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.onDeleted = onDeleted;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal", "animelist-confirm-modal");
    const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const title = createEl("h2", "", "移除這筆收藏？");
    const description = createEl("p", "", `「${fm.title || this.file.basename}」的 Markdown 筆記會移到系統垃圾桶；本地封面不會一併刪除。`);
    const actions = createEl("div", "al-modal-actions al-confirm-actions");
    const cancel = createEl("button", "", "先保留");
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const remove = createEl("button", "mod-warning", "移除作品");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await this.plugin.deleteMediaFile(this.file);
        this.close();
        if (this.onDeleted) this.onDeleted();
        new Notice("作品已從收藏庫移除。" );
      } catch (error) {
        console.error("AnimeList delete failed", error);
        new Notice(`移除失敗：${error?.message || error}`);
        remove.disabled = false;
      }
    });
    actions.append(cancel, remove);
    this.contentEl.append(title, description, actions);
  }
}

class EditMediaModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-modal", "animelist-edit-modal");
    const frontmatter = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "al-modal-heading";
    const title = document.createElement("h2");
    title.textContent = `整理：${frontmatter.title || this.file.basename}`;
    const description = document.createElement("p");
    description.textContent = "調整自己的進度、日期與評分；外部作品資料會保持原樣。";
    heading.append(title, description);
    this.contentEl.appendChild(heading);

    const mediaType = String(frontmatter.media_type || "anime");
    const form = document.createElement("div");
    form.className = "al-media-form";
    const statusOptions = mediaType === "anime"
      ? [["planned", "待追"], ["watching", "追番中"], ["completed", "已看完"], ["on_hold", "棄番"]]
      : [["planned", "待追"], ["reading", "追番中"], ["completed", "已讀完"], ["on_hold", "棄番"]];
    const titleInput = createLabeledField(form, "書架上的名稱", createTextInput("text", frontmatter.title || this.file.basename), "必填");
    titleInput.required = true;
    const currentStatus = String(frontmatter.status || "planned") === "dropped" ? "on_hold" : String(frontmatter.status || "planned");
    const status = createLabeledField(form, "目前狀態", createSelect(statusOptions, currentStatus));
    const score = createLabeledField(form, "我的評分（0–10）", createTextInput("number", frontmatter.score ?? ""), "必填；可輸入一位小數。");
    score.min = "0"; score.max = "10"; score.step = "0.1"; score.required = true;
    const progress = createLabeledField(form, "目前進度", createTextInput("number", frontmatter.progress ?? 0));
    progress.min = "0";
    const total = createLabeledField(form, "作品總數", createTextInput("number", frontmatter.progress_total ?? 0));
    total.min = "0";
    const startedAt = createLabeledField(form, "開始日期", createTextInput("date", frontmatter.started_at || ""));
    const completedAt = createLabeledField(form, "完成日期", createTextInput("date", frontmatter.completed_at || todayString()), "必填；缺少日期時預設為今天。");
    completedAt.required = true;
    const genreInput = createLabeledField(form, "分類", createTextInput("text", normalizeGenres(frontmatter.genres).join("、")), "可自行補充；常見中英文名稱會自動統一。" );
    const completionNote = createEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote);
    const favoriteWrap = document.createElement("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = document.createElement("input");
    favorite.type = "checkbox";
    favorite.checked = frontmatter.favorite === true;
    favoriteWrap.append(favorite, document.createTextNode(" 收進最愛"));
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const actions = document.createElement("div");
    actions.className = "al-modal-actions al-edit-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "al-delete-button";
    deleteButton.innerHTML = `${iconSvg("trash")}<span>移除作品</span>`;
    deleteButton.addEventListener("click", () => {
      new ConfirmDeleteModal(this.plugin, this.file, () => this.close()).open();
    });
    const save = document.createElement("button");
    save.type = "button";
    save.className = "mod-cta";
    save.textContent = "保存這次整理";
    save.addEventListener("click", async () => {
      const nextTitle = titleInput.value.trim();
      const nextScore = Number(score.value);
      if (!nextTitle) { new Notice("作品名稱不能留空。" ); return; }
      if (score.value === "" || !Number.isFinite(nextScore) || nextScore < 0 || nextScore > 10) { new Notice("請填入 0 到 10 之間的個人評分。" ); return; }
      if (!completedAt.value) { new Notice("完成日期不能留空。" ); return; }
      save.disabled = true;
      try {
        await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => {
          const nextTotal = Math.max(0, numeric(total.value));
          fm.title = nextTitle;
          fm.status = status.value;
          fm.progress_total = nextTotal;
          fm.progress = completedProgress(status.value, nextTotal, progress.value);
          fm.favorite = favorite.checked;
          fm.genres = genreInputValues(genreInput);
          fm.score = nextScore;
          if (startedAt.value) fm.started_at = startedAt.value; else delete fm.started_at;
          fm.completed_at = completedAt.value;
          delete fm.updated_at;
          delete fm.metadata_updated_at;
        });
        this.close();
        new Notice("這筆收藏已整理完成。" );
      } catch (error) {
        console.error("AnimeList edit failed", error);
        new Notice(`保存失敗：${error?.message || error}`);
        save.disabled = false;
      }
    });
    actions.append(deleteButton, save);
    this.contentEl.appendChild(actions);
  }
}

export class TimelineModal extends Modal {
  constructor(plugin, items) {
    super(plugin.app);
    this.plugin = plugin;
    this.items = items;
  }

  onOpen() {
    this.modalEl.classList.add("animelist-timeline-modal");
    this.contentEl.replaceChildren();
    TimelineUI.render(this.contentEl, this.items, {
      openFile: async (path) => {
        this.close();
        await this.plugin.app.workspace.openLinkText(path, "", false);
      },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class AnimeListRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath, config) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.config = config;
    this.renderTimer = null;
    this.viewMode = this.plugin.libraryViewModes?.get(this.sourcePath) || "grid";
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("create", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("delete", () => this.scheduleRender()));
    this.registerEvent(this.plugin.app.vault.on("rename", () => this.scheduleRender()));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 120);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  collectItems() {
    return this.plugin.collectMediaItems(this.config.source || undefined);
  }

  render() {
    AnimeListUI.renderLibrary(this.containerEl, this.collectItems(), {
      openFile: (path) => this.plugin.app.workspace.openLinkText(path, this.sourcePath),
      addItem: (initialType) => this.plugin.openAddModal(initialType),
      editItem: (path) => this.plugin.openEditModal(path),
      toggleFavorite: (path, next) => this.plugin.setFavorite(path, next),
      openTimeline: () => this.plugin.openTimeline(),
      initialView: this.viewMode,
      onViewChange: (view) => {
        this.viewMode = view;
        this.plugin.libraryViewModes?.set(this.sourcePath, view);
      },
    });
  }
}

export class DetailActionsRenderChild extends MarkdownRenderChild {
  constructor(containerEl, plugin, sourcePath) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.renderTimer = null;
  }

  onload() {
    this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => {
      if (file?.path === this.sourcePath) this.scheduleRender();
    }));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 80);
  }

  onunload() {
    window.clearTimeout(this.renderTimer);
  }

  render() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!file) return;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    this.containerEl.replaceChildren();
    const bar = createEl("div", "al-detail-actions");
    const summary = createEl("div", "al-detail-summary");
    const status = createEl("span", `al-status status-${fm.status || "planned"}`, itemStatusLabel({ status: fm.status || "planned", mediaType: fm.media_type || "anime" }));
    const progress = createEl("span", "", fm.progress_total ? `${fm.progress || 0} / ${fm.progress_total} ${LABEL.unit[fm.progress_unit] || fm.progress_unit || ""}` : "尚未記錄進度");
    summary.append(status, progress);
    if (fm.score != null && fm.score !== "") summary.appendChild(createEl("span", "al-detail-score", `★ ${Number(fm.score).toFixed(1)}`));
    const actions = createEl("div", "al-detail-buttons");
    const favorite = createEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`, fm.favorite === true ? "★ 最愛" : "☆ 加入最愛");
    favorite.type = "button";
    favorite.addEventListener("click", () => this.plugin.setFavorite(file.path, fm.favorite !== true));
    const edit = createEl("button", "", "整理紀錄");
    edit.type = "button";
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = createEl("button", "", "回到收藏庫");
    library.type = "button";
    library.addEventListener("click", () => this.plugin.openLibrary());
    actions.append(favorite, edit, library);
    const urls = asArray(fm.source_urls).filter(Boolean);
    if (urls[0]) {
      const external = createEl("button", "", "查看資料來源");
      external.type = "button";
      external.innerHTML = `${iconSvg("external")}<span>查看資料來源</span>`;
      external.addEventListener("click", () => window.open(String(urls[0]), "_blank"));
      actions.appendChild(external);
    }
    const remove = createEl("button", "al-detail-delete", "移除作品");
    remove.type = "button";
    remove.addEventListener("click", () => new ConfirmDeleteModal(this.plugin, file, () => this.plugin.openLibrary()).open());
    actions.appendChild(remove);
    bar.append(summary, actions);
    this.containerEl.appendChild(bar);
  }
}

export class LegacyAnimeListPlugin extends Plugin {
  async onload() {
    this.libraryViewModes = new Map();
    this.registerMarkdownCodeBlockProcessor("animelist", (source, element, context) => {
      const child = new AnimeListRenderChild(element, this, context.sourcePath, parseConfig(source));
      context.addChild(child);
    });
    this.registerMarkdownCodeBlockProcessor("animelist-detail", (_source, element, context) => {
      const child = new DetailActionsRenderChild(element, this, context.sourcePath);
      context.addChild(child);
    });
    this.addCommand({ id: "open-library", name: "開啟收藏書架", callback: () => this.app.workspace.openLinkText("Dashboard/Library", "", false) });
    this.addCommand({ id: "add-media", name: "搜尋並收錄作品", callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: "開啟時間軸", callback: () => this.openTimeline() });
  }

  openAddModal(initialType = "anime") {
    new AddMediaModal(this, initialType).open();
  }

  openEditModal(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) { new Notice("找不到這筆作品筆記。" ); return; }
    new EditMediaModal(this, file).open();
  }

  openTimeline() {
    new TimelineModal(this, this.collectMediaItems(MEDIA_ROOT)).open();
  }

  collectMediaItems(source = MEDIA_ROOT) {
    const root = String(source || MEDIA_ROOT).replace(/^\/+|\/+$/g, "");
    return this.app.vault.getMarkdownFiles()
      .filter((file) => file.path === root || file.path.startsWith(`${root}/`))
      .map((file) => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm || !fm.media_type) return null;
        const coverPath = String(fm.cover || "").replace(/^!\[\[/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
        let cover = "";
        if (/^https?:\/\//i.test(coverPath)) cover = coverPath;
        else if (coverPath) {
          const coverFile = this.app.metadataCache.getFirstLinkpathDest(coverPath, file.path) || this.app.vault.getAbstractFileByPath(coverPath);
          if (coverFile) cover = this.app.vault.getResourcePath(coverFile);
        }
        const people = asArray(fm.studios).length ? asArray(fm.studios) : asArray(fm.authors).length ? asArray(fm.authors) : asArray(fm.creators);
        return {
          title: String(fm.title || file.basename), originalTitle: String(fm.title_original || fm.title_romaji || ""),
          mediaType: String(fm.media_type), format: String(fm.format || fm.media_type), status: String(fm.status || "planned"),
          progress: fm.progress || 0, total: fm.progress_total || 0, unit: String(fm.progress_unit || ""), score: fm.score,
          favorite: fm.favorite === true, year: fm.year || "", genres: normalizeGenres(fm.genres), people,
          platforms: asArray(fm.platforms), sourceUrls: asArray(fm.source_urls), cover, filePath: file.path,
          updated: Number(file.stat?.mtime || 0), updatedLabel: file.stat?.mtime ? `更新於 ${formatFileModifiedTime(file.stat.mtime)}` : "",
          startedAt: fm.started_at || "", completedAt: fm.completed_at || "",
        };
      }).filter(Boolean);
  }

  async setFavorite(path, next) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error("找不到作品筆記");
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.favorite = next === true;
      delete fm.updated_at;
      delete fm.metadata_updated_at;
    });
    new Notice(next ? "已收進最愛。" : "已從最愛中移除。" );
  }

  async deleteMediaFile(file) {
    if (this.app.fileManager?.trashFile) return await this.app.fileManager.trashFile(file);
    if (this.app.vault?.trash) return await this.app.vault.trash(file, true);
    return await this.app.vault.delete(file);
  }

  async getTemplates(mediaType) {
    const typeFolder = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (!file.path.startsWith(`${TEMPLATE_ROOT}/`)) return false;
      const relative = file.path.slice(TEMPLATE_ROOT.length + 1);
      return !relative.includes("/") || relative.startsWith("Common/") || relative.startsWith(`${typeFolder}/`);
    });
    return files.sort((a, b) => a.path.localeCompare(b.path, "zh-Hant")).map((file) => ({
      path: file.path,
      name: file.path.startsWith(`${TEMPLATE_ROOT}/Common/`) ? `${file.basename}（共用）` : file.basename,
    }));
  }

  async readTemplate(path) {
    if (!path) return "";
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return "";
    return await this.app.vault.cachedRead(file);
  }

  async searchExternal(mediaType, query) {
    const tasks = [
      this.searchBangumi(mediaType, query).then((items) => ({ provider: "Bangumi", items })).catch((error) => ({ provider: "Bangumi", error })),
      this.searchAniList(mediaType, query).then((items) => ({ provider: "AniList", items })).catch((error) => ({ provider: "AniList", error })),
    ];
    if (mediaType === "novel") tasks.push(this.searchOpenLibrary(query).then((items) => ({ provider: "Open Library", items })).catch((error) => ({ provider: "Open Library", error })));
    const settled = await Promise.all(tasks);
    const warnings = settled.filter((entry) => entry.error).map((entry) => `${entry.provider}: ${entry.error?.message || entry.error}`);
    const all = [];
    settled.forEach((entry) => { if (entry.items) all.push(...entry.items); });
    return { results: dedupeSearchResults(all).slice(0, 24), warnings };
  }

  async searchBangumi(mediaType, query) {
    const response = await requestUrl({
      url: "https://api.bgm.tv/v0/search/subjects?limit=10&offset=0", method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ keyword: query, sort: "match", filter: { type: [mediaType === "anime" ? 2 : 1], nsfw: false } }),
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    return asArray(payload.data).map((subject) => normalizeBangumiSubject(subject, mediaType));
  }

  async searchAniList(mediaType, query) {
    const graphQuery = `
      query ($search: String, $type: MediaType, $format: MediaFormat) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: $type, format: $format, sort: SEARCH_MATCH) {
            id siteUrl type format episodes chapters volumes averageScore description(asHtml: false) genres synonyms
            startDate { year month day }
            title { romaji english native }
            coverImage { extraLarge large medium }
            studios(isMain: true) { nodes { name } }
            staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
          }
        }
      }`;
    const variables = { search: query, type: mediaType === "anime" ? "ANIME" : "MANGA", format: mediaType === "novel" ? "NOVEL" : null };
    const response = await requestUrl({
      url: "https://graphql.anilist.co", method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ query: graphQuery, variables }),
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    let media = asArray(payload?.data?.Page?.media);
    if (mediaType === "manga") media = media.filter((item) => String(item?.format || "").toUpperCase() !== "NOVEL");
    return media.map((item) => normalizeAniListMedia(item, mediaType));
  }

  async searchOpenLibrary(query) {
    const fields = "key,title,author_name,first_publish_year,cover_i,subject";
    const response = await requestUrl({
      url: `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=8&lang=zh`,
      method: "GET", headers: { "Accept": "application/json", "User-Agent": USER_AGENT },
    });
    const payload = response.json || JSON.parse(response.text || "{}");
    return asArray(payload.docs).map(normalizeOpenLibraryBook);
  }

  async ensureFolder(path) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try { await this.app.vault.createFolder(current); }
        catch (error) { if (!this.app.vault.getAbstractFileByPath(current)) throw error; }
      }
    }
  }

  findExistingBySource(provider, sourceId) {
    return this.app.vault.getMarkdownFiles().find((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return fm && String(fm.source_provider || "") === String(provider) && String(fm.source_id || "") === String(sourceId);
    });
  }

  async uniqueFilePath(folder, baseName, extension) {
    const clean = sanitizePathPart(baseName);
    let candidate = normalizePath(`${folder}/${clean}.${extension}`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folder}/${clean} (${index}).${extension}`);
      index += 1;
    }
    return candidate;
  }

  async downloadCover(result) {
    if (!result.coverUrl) return "";
    const response = await requestUrl({
      url: result.coverUrl, method: "GET",
      headers: { "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*", "User-Agent": USER_AGENT },
    });
    const rawHeaders = response.headers || {};
    const contentType = Object.entries(rawHeaders).find(([key]) => key.toLocaleLowerCase() === "content-type")?.[1] || "";
    const extension = /webp/i.test(contentType) ? "webp" : /png/i.test(contentType) ? "png" : /avif/i.test(contentType) ? "avif" : "jpg";
    const folder = normalizePath(`${COVER_ROOT}/${result.mediaType}`);
    await this.ensureFolder(folder);
    const identity = result.sourceId || Date.now();
    const filename = `${slugify(result.title)}-${result.provider}-${identity}`;
    const path = await this.uniqueFilePath(folder, filename, extension);
    await this.app.vault.createBinary(path, response.arrayBuffer);
    return path;
  }

  async createMediaNote(result, form) {
    const title = String(form?.title || "").trim();
    const score = Number(form?.score);
    const completedAt = String(form?.completedAt || "").trim();
    if (!title) throw new Error("作品名稱為必填欄位");
    if (form?.score === "" || form?.score == null || !Number.isFinite(score) || score < 0 || score > 10) throw new Error("個人評分必須是 0 到 10 之間的數字");
    if (!completedAt) throw new Error("完成日期為必填欄位");
    const existing = this.findExistingBySource(result.provider, result.sourceId);
    if (existing) {
      new Notice("這筆外部資料已經在收藏庫中，已替你開啟原筆記。" );
      await this.app.workspace.openLinkText(existing.path, "", false);
      return existing;
    }
    let coverPath = "";
    if (result.coverUrl) {
      try { coverPath = await this.downloadCover(result); }
      catch (error) {
        console.warn("AnimeList cover download failed; using remote URL", error);
        new Notice("封面暫時無法存到本機，會先使用遠端圖片。" );
      }
    }
    const folderName = result.mediaType === "anime" ? "Anime" : result.mediaType === "manga" ? "Manga" : "Novel";
    const folder = normalizePath(`${MEDIA_ROOT}/${folderName}`);
    await this.ensureFolder(folder);
    const path = await this.uniqueFilePath(folder, form.title || result.title, "md");
    const templateContent = await this.readTemplate(form.templatePath);
    const markdown = buildMediaMarkdown(result, form, coverPath, templateContent);
    return await this.app.vault.create(path, markdown);
  }
}

export const legacyTest = {
  normalizeBangumiSubject, normalizeAniListMedia, normalizeOpenLibraryBook, dedupeSearchResults,
  buildMediaMarkdown, sanitizePathPart, normalizeGenres, completedProgress, applyTemplateVariables, formatFileModifiedTime,
  ensureDetailBlock, AnimeListUI, TimelineUI,
};

export default LegacyAnimeListPlugin;

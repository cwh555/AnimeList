/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- Legacy compatibility layer consumes runtime-validated provider data while preserving the tested v6.2 behavior. */
// @ts-nocheck
import { MarkdownRenderChild, Modal, Notice, Plugin, requestUrl, normalizePath, setIcon } from "obsidian";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  completedRequirementMessage,
  completedStatusLabel,
  mediaFormatLabel,
  mediaProviderLabel,
  mediaStatusLabel,
  statusFilterOptions,
  uiText,
} from "./ui-text";
import {
  compareVolumeLabels,
  expandTimelineEntries,
  highestCompletedVolume,
  normalizeProgressValue,
  normalizeReleaseStatus,
  normalizeVolumeLabel,
  normalizeVolumeLog,
  progressDisplayValue,
  progressRatio,
  serializeVolumeLog,
} from "./novel-progress";

const PLUGIN_VERSION = "1.1.0";
const MEDIA_ROOT = "Media";
const COVER_ROOT = "Assets/Covers";
const TEMPLATE_ROOT = "Templates";
const USER_AGENT = `AnimeList-Obsidian/${PLUGIN_VERSION} (local personal media library)`;

const LABEL = {
  type: {
    get all() { return uiText("media.type.all"); },
    get anime() { return uiText("media.type.anime"); },
    get manga() { return uiText("media.type.manga"); },
    get novel() { return uiText("media.type.novel"); },
  },
  unit: {
    get episode() { return uiText("media.unit.episode"); },
    get chapter() { return uiText("media.unit.chapter"); },
    get volume() { return uiText("media.unit.volume"); },
    get page() { return uiText("media.unit.page"); },
    get percent() { return uiText("media.unit.percent"); },
  },
  releaseStatus: {
    get releasing() { return uiText("media.release.releasing"); },
    get finished() { return uiText("media.release.finished"); },
    get hiatus() { return uiText("media.release.hiatus"); },
    get cancelled() { return uiText("media.release.cancelled"); },
    get unknown() { return uiText("media.release.unknown"); },
  },
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

function stringValue(value, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
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

function yamlVolumeLog(lines, entries) {
  const serialized = serializeVolumeLog(entries);
  if (!serialized.length) return;
  lines.push("volume_log:");
  for (const entry of serialized) {
    lines.push(`  - label: ${yamlScalar(entry.label)}`);
    Object.entries(entry).forEach(([key, value]) => {
      if (key === "label" || value === "") return;
      lines.push(`    ${key}: ${yamlScalar(value)}`);
    });
  }
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
  const localTitle = String(subject?.name_cn || originalTitle || uiText("media.untitled")).trim();
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
  const total = mediaType === "anime" ? numeric(subject?.eps || subject?.total_episodes) : 0;
  const rawGenres = asArray(subject?.tags).slice(0, 16).map((tag) => typeof tag === "string" ? tag : tag?.name).filter(Boolean);
  return {
    provider: "bangumi", sourceId: String(subject?.id ?? ""), sourceUrl: subject?.id ? `https://bgm.tv/subject/${subject.id}` : "",
    mediaType, title: localTitle, originalTitle, romajiTitle: "", format, year: numeric(date.slice(0, 4), ""),
    coverUrl: images.large || images.common || images.medium || images.small || images.grid || "",
    genres: normalizeGenres(rawGenres), rawGenres, people, platforms: platform ? [platform] : [], total,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: String(subject?.summary || "").trim(), externalScore: numeric(subject?.rating?.score, null), releaseStatus: "unknown",
  };
}

function normalizeAniListMedia(media, selectedType) {
  const title = media?.title || {};
  const localTitle = String(title.english || title.romaji || title.native || uiText("media.untitled")).trim();
  const originalTitle = String(title.native || title.romaji || "").trim();
  const staff = asArray(media?.staff?.edges)
    .filter((edge) => /creator|story|art|author|original/i.test(String(edge?.role || "")))
    .map((edge) => edge?.node?.name?.native || edge?.node?.name?.full).filter(Boolean);
  const studios = asArray(media?.studios?.nodes).map((node) => node?.name).filter(Boolean);
  const mediaType = selectedType;
  const releaseStatus = ({ RELEASING: "releasing", FINISHED: "finished", HIATUS: "hiatus", CANCELLED: "cancelled" })[String(media?.status || "").toUpperCase()] || "unknown";
  const total = mediaType === "anime" ? numeric(media?.episodes) : 0;
  const rawGenres = asArray(media?.genres).slice(0, 12);
  return {
    provider: "anilist", sourceId: String(media?.id ?? ""),
    sourceUrl: String(media?.siteUrl || (media?.id ? `https://anilist.co/${mediaType === "anime" ? "anime" : "manga"}/${media.id}` : "")),
    mediaType, title: localTitle, originalTitle, romajiTitle: String(title.romaji || ""), format: mapFormat(media?.format, mediaType),
    year: numeric(media?.startDate?.year, ""), coverUrl: media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || "",
    genres: normalizeGenres(rawGenres), rawGenres, people: mediaType === "anime" ? studios : staff, platforms: [], total,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: stripHtml(media?.description), externalScore: media?.averageScore == null ? null : numeric(media.averageScore) / 10, releaseStatus,
  };
}

function normalizeOpenLibraryBook(book) {
  const key = String(book?.key || "").replace(/^\/works\//, "");
  const rawGenres = asArray(book?.subject).slice(0, 16);
  return {
    provider: "openlibrary", sourceId: key, sourceUrl: key ? `https://openlibrary.org/works/${key}` : "", mediaType: "novel",
    title: String(book?.title || uiText("media.untitled")), originalTitle: String(book?.title || ""), romajiTitle: "", format: "novel",
    year: numeric(book?.first_publish_year, ""), coverUrl: book?.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false` : "",
    genres: normalizeGenres(rawGenres), rawGenres, people: asArray(book?.author_name).slice(0, 6), platforms: [], total: 0, unit: "volume", summary: "", externalScore: null, releaseStatus: "unknown",
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

function completedProgress(status, total, current, mediaType = "anime") {
  const safeCurrent = mediaType === "novel" ? normalizeProgressValue(current) : Math.max(0, numeric(current));
  if (mediaType !== "anime") return safeCurrent;
  const safeTotal = Math.max(0, numeric(total));
  return status === "completed" && safeTotal > 0 ? safeTotal : safeCurrent;
}

function buildMediaMarkdown(result, form, coverPath, templateContent = "") {
  const title = String(form.title || "").trim();
  const hasScore = form.score !== "" && form.score != null;
  const score = hasScore ? Number(form.score) : null;
  const completedAt = String(form.completedAt || "").trim();
  if (!title) throw new Error(uiText("validation.titleRequired"));
  if (form.status === "completed" && !hasScore) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.score")));
  if (hasScore && (score == null || !Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error(uiText("validation.scoreRange"));
  }
  if (form.status === "completed" && !completedAt) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.completedAt")));
  const total = result.mediaType === "anime"
    ? Math.max(0, numeric(form.total ?? result.total))
    : 0;
  const progress = completedProgress(form.status, total, form.progress, result.mediaType);
  const genres = normalizeGenres(form.genres?.length ? form.genres : result.genres);
  const releaseStatus = result.mediaType === "anime"
    ? "unknown"
    : normalizeReleaseStatus(form.releaseStatus || result.releaseStatus);
  const volumeLog = result.mediaType === "novel" ? normalizeVolumeLog(form.volumeLog) : [];
  const lines = ["---", "schema_version: 5"];
  lines.push(`title: ${yamlScalar(title)}`);
  if (result.originalTitle) lines.push(`title_original: ${yamlScalar(result.originalTitle)}`);
  if (result.romajiTitle && result.romajiTitle !== result.originalTitle) lines.push(`title_romaji: ${yamlScalar(result.romajiTitle)}`);
  lines.push(`media_type: ${yamlScalar(result.mediaType)}`);
  lines.push(`format: ${yamlScalar(result.format || result.mediaType)}`);
  lines.push(`status: ${yamlScalar(form.status || "planned")}`);
  if (result.mediaType !== "anime") lines.push(`release_status: ${yamlScalar(releaseStatus)}`);
  lines.push(`progress: ${yamlScalar(progress)}`);
  if (result.mediaType === "anime") lines.push(`progress_total: ${yamlScalar(total)}`);
  lines.push(`progress_unit: ${yamlScalar(form.unit || result.unit)}`);
  if (score != null) lines.push(`score: ${score}`);
  lines.push(`favorite: ${form.favorite === true ? "true" : "false"}`);
  if (result.year) lines.push(`year: ${numeric(result.year)}`);
  if (form.startedAt) lines.push(`started_at: ${yamlScalar(form.startedAt)}`);
  if (completedAt) lines.push(`completed_at: ${yamlScalar(completedAt)}`);
  yamlVolumeLog(lines, volumeLog);
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
  else if (!coverPath && result.coverUrl && !body.includes(result.coverUrl)) body = body.replace(/(```animelist-detail\n```)/, `$1\n\n![${uiText("library.coverAlt", { title })}](${result.coverUrl})`);
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
  return mediaStatusLabel(item.status, item.mediaType);
}

function makeEl(tag, className, text) {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setAnimeListIcon(element, name) {
  const iconIds = {
    search: "search",
    grid: "layout-grid",
    list: "list",
    poster: "image",
    sort: "list-filter",
    book: "book-open",
    plus: "plus",
    edit: "pencil",
    timeline: "git-branch",
    trash: "trash-2",
    external: "external-link",
    minus: "minus",
    fit: "maximize-2",
  };
  setIcon(element, iconIds[name] || name);
  return element;
}

function appendIconLabel(element, icon, label) {
  setAnimeListIcon(element, icon);
  element.appendChild(makeEl("span", "", label));
  return element;
}

export const AnimeListUI = (() => {
  const normalize = (item) => {
    const mediaType = String(item.mediaType || item.media_type || "").toLowerCase();
    return {
    ...item,
    mediaType,
    status: String(item.status || "planned").toLowerCase(),
    format: String(item.format || item.mediaType || item.media_type || "").toLowerCase(),
    releaseStatus: normalizeReleaseStatus(item.releaseStatus || item.release_status),
    progress: normalizeProgressValue(item.progress),
    total: mediaType === "anime" ? normalizeProgressValue(item.total ?? item.progress_total) : 0,
    score: item.score === "" || item.score == null ? null : numeric(item.score, null),
    genres: normalizeGenres(item.genres),
    people: asArray(item.people).filter(Boolean),
    platforms: asArray(item.platforms).filter(Boolean),
    sourceUrls: asArray(item.sourceUrls || item.source_urls).filter(Boolean),
    favorite: item.favorite === true,
    updated: numeric(item.updated),
    startedAt: String(item.startedAt || item.started_at || ""),
    completedAt: String(item.completedAt || item.completed_at || ""),
    volumeLog: normalizeVolumeLog(item.volumeLog || item.volume_log),
    };
  };

  const ratio = (item) => item.mediaType === "anime" ? progressRatio(item.progress, item.total, item.unit) : null;
  const hasProgress = (value) => value !== "" && value != null && !(typeof value === "number" && value <= 0) && String(value) !== "0";

  const progressText = (item) => {
    const unit = LABEL.unit[item.unit] || item.unit || "";
    const current = progressDisplayValue(item.progress);
    const total = progressDisplayValue(item.total);
    if (item.mediaType === "anime" && hasProgress(item.total)) return `${current} / ${total} ${unit}`.trim();
    if (hasProgress(item.progress)) return uiText(
      item.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress",
      { progress: current, unit },
    ).trim();
    return uiText("library.notStarted");
  };

  const statusMatch = (item, filter) => {
    if (filter === "all") return true;
    if (filter === "active") return ["watching", "reading"].includes(item.status);
    return item.status === filter;
  };

  function renderLibrary(container, inputItems, adapters = {}) {
    container.replaceChildren();
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

    const shell = makeEl("section", "al-shell");
    container.appendChild(shell);

    const header = makeEl("header", "al-hero");
    const titleBlock = makeEl("div", "al-hero-copy");
    titleBlock.append(
      makeEl("div", "al-kicker", uiText("library.kicker")),
      makeEl("h1", "al-title", uiText("library.title")),
      makeEl("p", "al-desc", uiText("library.description")),
    );
    const headerRight = makeEl("div", "al-hero-right");
    const stats = makeEl("div", "al-stats");
    [["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([key, label]) => {
      const stat = makeEl("div", "al-stat");
      stat.append(makeEl("strong", "al-stat-number", items.filter((x) => x.mediaType === key).length), makeEl("span", "al-stat-label", label));
      stats.appendChild(stat);
    });
    headerRight.appendChild(stats);
    const headerActions = makeEl("div", "al-hero-actions");
    if (openTimeline) {
      const timelineButton = makeEl("button", "al-secondary-button");
      timelineButton.type = "button";
      appendIconLabel(timelineButton, "timeline", uiText("library.timeline"));
      timelineButton.addEventListener("click", () => openTimeline());
      headerActions.appendChild(timelineButton);
    }
    if (addItem) {
      const addButton = makeEl("button", "al-add-button");
      addButton.type = "button";
      appendIconLabel(addButton, "plus", uiText("action.collect"));
      addButton.addEventListener("click", () => addItem(state.type === "all" ? "anime" : state.type));
      headerActions.appendChild(addButton);
    }
    headerRight.appendChild(headerActions);
    header.append(titleBlock, headerRight);
    shell.appendChild(header);

    const nav = makeEl("nav", "al-type-tabs");
    const typeButtons = new Map();
    [["all", uiText("library.tabAll")], ["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([key, label]) => {
      const count = key === "all" ? items.length : items.filter((x) => x.mediaType === key).length;
      const button = makeEl("button", `al-type-tab${key === state.type ? " is-active" : ""}`);
      button.type = "button";
      button.append(makeEl("span", "", label), makeEl("span", "al-tab-count", count));
      button.addEventListener("click", () => {
        state.type = key;
        typeButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
        renderStatusButtons();
        update();
      });
      typeButtons.set(key, button);
      nav.appendChild(button);
    });
    shell.appendChild(nav);

    const toolbar = makeEl("div", "al-toolbar");
    const searchWrap = makeEl("label", "al-search");
    const searchIcon = makeEl("span", "al-icon");
    setAnimeListIcon(searchIcon, "search");
    const searchInput = makeEl("input");
    searchInput.type = "search";
    searchInput.placeholder = uiText("library.searchPlaceholder");
    searchInput.value = state.query;
    searchInput.addEventListener("input", () => { state.query = searchInput.value.trim().toLocaleLowerCase(); update(); });
    searchWrap.append(searchIcon, searchInput);

    const genreWrap = makeEl("label", "al-sort al-genre-filter");
    const genreSelect = makeEl("select");
    [["all", uiText("library.genreAll")], ...genres.map((genre) => [genre, genre])].forEach(([value, text]) => {
      const option = makeEl("option", "", text);
      option.value = value;
      genreSelect.appendChild(option);
    });
    if (genres.includes(state.genre)) genreSelect.value = state.genre;
    else state.genre = "all";
    genreSelect.addEventListener("change", () => { state.genre = genreSelect.value; update(); });
    genreWrap.appendChild(genreSelect);

    const sortWrap = makeEl("label", "al-sort");
    const sortIcon = makeEl("span", "al-icon");
    setAnimeListIcon(sortIcon, "sort");
    const sortSelect = makeEl("select");
    [
      ["completed-desc", uiText("library.sort.completedDesc")], ["completed-asc", uiText("library.sort.completedAsc")],
      ["updated-desc", uiText("library.sort.updatedDesc")], ["updated-asc", uiText("library.sort.updatedAsc")], ["score-desc", uiText("library.sort.scoreDesc")], ["score-asc", uiText("library.sort.scoreAsc")],
      ["started-desc", uiText("library.sort.startedDesc")], ["started-asc", uiText("library.sort.startedAsc")],
      ["year-desc", uiText("library.sort.yearDesc")], ["year-asc", uiText("library.sort.yearAsc")], ["progress-desc", uiText("library.sort.progressDesc")], ["title-asc", uiText("library.sort.titleAsc")],
    ].forEach(([value, text]) => {
      const option = makeEl("option", "", text);
      option.value = value;
      option.selected = value === state.sort;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener("change", () => { state.sort = sortSelect.value; update(); });
    sortWrap.append(sortIcon, sortSelect);

    const views = makeEl("div", "al-view-switch");
    const viewButtons = new Map();
    [["grid", "grid", uiText("library.view.grid")], ["list", "list", uiText("library.view.list")], ["poster", "poster", uiText("library.view.poster")]].forEach(([key, icon, label]) => {
      const button = makeEl("button", `al-view-button${key === state.view ? " is-active" : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      setAnimeListIcon(button, icon);
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

    const statusBar = makeEl("div", "al-status-bar");
    const statusButtons = new Map();
    const renderStatusButtons = () => {
      statusButtons.clear();
      statusBar.replaceChildren();
      statusFilterOptions(state.type).forEach(([key, label]) => {
        const button = makeEl("button", `al-status-chip${key === state.status ? " is-active" : ""}`, label);
        button.type = "button";
        button.addEventListener("click", () => {
          state.status = key;
          statusButtons.forEach((candidate, name) => candidate.classList.toggle("is-active", name === key));
          update();
        });
        statusButtons.set(key, button);
        statusBar.appendChild(button);
      });
    };
    renderStatusButtons();
    shell.appendChild(statusBar);

    const resultHead = makeEl("div", "al-result-head");
    const resultTitle = makeEl("strong", "al-result-title");
    const resultMeta = makeEl("span", "al-result-meta");
    resultHead.append(resultTitle, resultMeta);
    shell.appendChild(resultHead);
    const grid = makeEl("div", "al-grid is-grid");
    shell.appendChild(grid);

    const makeCard = (item) => {
      const card = makeEl("article", `al-card status-${item.status}`);
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.addEventListener("click", () => openFile(item.filePath));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFile(item.filePath); }
      });

      const media = makeEl("div", "al-cover-wrap");
      if (item.cover) {
        const image = makeEl("img", "al-cover");
        image.src = item.cover;
        image.alt = uiText("library.coverAlt", { title: item.title });
        image.loading = "lazy";
        media.appendChild(image);
      } else {
        const missing = makeEl("div", "al-cover-missing");
        const icon = makeEl("span", "al-icon-large");
        setAnimeListIcon(icon, "book");
        missing.append(icon, makeEl("span", "", uiText("library.coverMissing")));
        media.appendChild(missing);
      }
      media.appendChild(makeEl("div", "al-cover-shade"));
      const top = makeEl("div", "al-cover-top");
      const badges = makeEl("div", "al-cover-badges");
      badges.appendChild(makeEl("span", "al-format-badge", `${LABEL.type[item.mediaType] || item.mediaType} · ${item.year || "—"}`));
      if (item.score != null) badges.appendChild(makeEl("span", "al-score-badge", `★ ${item.score.toFixed(1)}`));
      top.appendChild(badges);
      const topActions = makeEl("div", "al-card-top-actions");
      if (toggleFavorite) {
        const favoriteButton = makeEl("button", `al-favorite-button${item.favorite ? " is-active" : ""}`, item.favorite ? "★" : "☆");
        favoriteButton.type = "button";
        favoriteButton.title = item.favorite ? uiText("library.favoriteRemove") : uiText("library.favoriteAdd");
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
        const editButton = makeEl("button", "al-edit-button");
        editButton.type = "button";
        editButton.title = uiText("action.edit");
        editButton.setAttribute("aria-label", editButton.title);
        setAnimeListIcon(editButton, "edit");
        editButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); editItem(item.filePath); });
        topActions.appendChild(editButton);
      }
      top.appendChild(topActions);
      media.appendChild(top);
      const bottom = makeEl("div", "al-cover-bottom");
      const statusBadges = makeEl("span", "al-status-group");
      statusBadges.appendChild(makeEl("span", `al-status status-${item.status}`, itemStatusLabel(item)));
      bottom.append(statusBadges, makeEl("span", "al-progress-on-cover", progressText(item)));
      media.appendChild(bottom);

      const body = makeEl("div", "al-card-body");
      body.appendChild(makeEl("h2", "al-card-title", item.title));
      if (item.originalTitle) body.appendChild(makeEl("div", "al-original-title", item.originalTitle));
      const facts = makeEl("div", "al-facts");
      facts.appendChild(makeEl("span", "", mediaFormatLabel(item.format) || uiText("library.unknownFormat")));
      if (item.people.length) facts.appendChild(makeEl("span", "", item.people.slice(0, 2).join("、")));
      body.appendChild(facts);
      if (item.startedAt || item.completedAt) {
        const dates = makeEl("div", "al-date-row");
        if (item.startedAt) dates.appendChild(makeEl("span", "", uiText("library.startedAt", { date: item.startedAt })));
        if (item.completedAt) dates.appendChild(makeEl("span", "", uiText("library.completedAt", { date: item.completedAt })));
        body.appendChild(dates);
      }
      if (item.genres.length) {
        const tags = makeEl("div", "al-tags");
        item.genres.slice(0, 4).forEach((genre) => tags.appendChild(makeEl("span", "al-tag", genre)));
        body.appendChild(tags);
      }
      const progress = makeEl("div", "al-progress");
      const itemRatio = ratio(item);
      if (itemRatio !== null) {
        const bar = makeEl("div", "al-progress-track");
        const fill = makeEl("div", "al-progress-fill");
        fill.style.width = `${Math.round(itemRatio * 100)}%`;
        bar.appendChild(fill);
        progress.appendChild(bar);
      }
      const progressRow = makeEl("div", "al-progress-row");
      progressRow.appendChild(makeEl("span", "", progressText(item)));
      if (itemRatio !== null) progressRow.appendChild(makeEl("span", "", `${Math.round(itemRatio * 100)}%`));
      else if (item.mediaType !== "anime") progressRow.appendChild(makeEl("span", "al-release-label", LABEL.releaseStatus[item.releaseStatus] || uiText("media.release.unknown")));
      progress.appendChild(progressRow);
      body.appendChild(progress);
      const footer = makeEl("div", "al-card-footer");
      footer.append(makeEl("span", "al-updated", item.updatedLabel || ""), makeEl("span", "al-score", item.score == null ? uiText("library.unrated") : `★ ${item.score.toFixed(1)}`));
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
        "progress-desc": (a, b) => (ratio(b) ?? -1) - (ratio(a) ?? -1),
      };
      filtered.sort(sorters[state.sort] || sorters["completed-desc"]);
      resultTitle.textContent = state.type === "all" ? uiText("library.resultAll") : LABEL.type[state.type];
      const genreSuffix = state.genre === "all" ? "" : ` · ${state.genre}`;
      resultMeta.textContent = uiText("library.resultMeta", { shown: filtered.length, total: items.length, genre: genreSuffix });
      grid.className = `al-grid is-${state.view}`;
      grid.replaceChildren();
      if (!filtered.length) {
        const empty = makeEl("div", "al-empty");
        const icon = makeEl("span", "al-empty-icon");
        setAnimeListIcon(icon, "book");
        empty.append(icon, makeEl("strong", "", uiText("library.emptyTitle")), makeEl("span", "", uiText("library.emptyDescription")));
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

function assignTimelineLanes(positionedItems, minimumDistance) {
  const laneEnds = [];
  return positionedItems.map((positioned) => {
    let lane = laneEnds.findIndex((lastX) => positioned.x - lastX >= minimumDistance);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = positioned.x;
    return { ...positioned, lane };
  });
}

function filterTimelineEntries(items, mediaType) {
  if (mediaType !== "anime" && mediaType !== "manga" && mediaType !== "novel") return items;
  return items.filter((item) => item.mediaType === mediaType);
}

export const TimelineUI = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_DAY_SPACING = 0.18;
  const MAX_DAY_SPACING = 96;
  const CARD_WIDTH = 120;
  const CARD_HEIGHT = 146;
  const CARD_GAP_X = 16;
  const CARD_GAP_Y = 18;
  const STEM_GAP = 44;
  const SCENE_PADDING_Y = 56;
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
    const allItems = expandTimelineEntries(inputItems)
      .map((item) => ({ ...item, completedTime: dayStart(item.completedAt || item.completed_at) }))
      .filter((item) => item.completedTime)
      .sort((a, b) => a.completedTime - b.completedTime || String(a.title).localeCompare(String(b.title), "zh-Hant"));
    if (!allItems.length) {
      const empty = makeEl("div", "al-timeline-empty");
      setAnimeListIcon(empty, "timeline");
      empty.append(
        makeEl("strong", "", uiText("timeline.emptyTitle")),
        makeEl("span", "", uiText("timeline.emptyDescription")),
      );
      container.appendChild(empty);
      return { items: 0 };
    }

    const selectedType = adapters.typeFilter === "anime"
      || adapters.typeFilter === "manga"
      || adapters.typeFilter === "novel"
      ? adapters.typeFilter
      : "all";
    const items = filterTimelineEntries(allItems, selectedType);

    const sidePadding = 170;
    const grouped = new Map();
    for (const item of items) {
      const key = item.completedTime;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const dates = [...grouped.keys()].sort((a, b) => a - b);
    const minTime = dates[0] || 0;
    const maxTime = dates[dates.length - 1] || minTime;
    const rangeDays = Math.max(1, Math.round((maxTime - minTime) / DAY_MS));
    const baseSpacing = initialDaySpacing(rangeDays);
    const state = { x: 0, y: 0, daySpacing: baseSpacing, sceneWidth: 0, sceneHeight: 0 };

    const root = makeEl("div", "al-timeline-root");
    const toolbar = makeEl("div", "al-timeline-toolbar");
    const copy = makeEl("div", "al-timeline-copy");
    copy.append(
      makeEl("strong", "", uiText("timeline.title")),
      makeEl("span", "", items.length
        ? uiText("timeline.summary", { count: items.length, start: formatDate(minTime), end: formatDate(maxTime) })
        : uiText("timeline.summaryEmpty")),
    );
    const typeFilters = makeEl("div", "al-timeline-type-filters");
    typeFilters.setAttribute("role", "group");
    typeFilters.setAttribute("aria-label", uiText("timeline.title"));
    const typeOptions = [
      ["all", uiText("timeline.filterAll")],
      ["anime", uiText("media.type.anime")],
      ["manga", uiText("media.type.manga")],
      ["novel", uiText("media.type.novel")],
    ];
    for (const [type, label] of typeOptions) {
      const button = makeEl("button", `al-timeline-type-filter${selectedType === type ? " is-active" : ""}`, label);
      button.type = "button";
      button.setAttribute("aria-pressed", selectedType === type ? "true" : "false");
      button.addEventListener("click", () => {
        if (selectedType === type) return;
        render(container, inputItems, { ...adapters, typeFilter: type });
      });
      typeFilters.appendChild(button);
    }
    const controls = makeEl("div", "al-timeline-controls");
    const zoomOut = makeEl("button", "", "");
    zoomOut.type = "button"; zoomOut.title = uiText("timeline.zoomOut"); setAnimeListIcon(zoomOut, "minus");
    const zoomLabel = makeEl("span", "al-timeline-zoom", "100%");
    const zoomIn = makeEl("button", "", "");
    zoomIn.type = "button"; zoomIn.title = uiText("timeline.zoomIn"); setAnimeListIcon(zoomIn, "plus");
    const fit = makeEl("button", "", "");
    fit.type = "button"; fit.title = uiText("timeline.fit"); setAnimeListIcon(fit, "fit");
    controls.append(zoomOut, zoomLabel, zoomIn, fit);
    controls.hidden = !items.length;
    toolbar.append(copy, typeFilters, controls);
    root.appendChild(toolbar);

    if (!items.length) {
      const empty = makeEl("div", "al-timeline-empty");
      setAnimeListIcon(empty, "timeline");
      empty.append(
        makeEl("strong", "", uiText("timeline.emptyTitle")),
        makeEl("span", "", uiText("timeline.emptyDescription")),
      );
      root.appendChild(empty);
      container.appendChild(root);
      return { items: 0, totalItems: allItems.length, type: selectedType };
    }

    const viewport = makeEl("div", "al-timeline-viewport");
    const scene = makeEl("div", "al-timeline-scene");
    viewport.appendChild(scene);
    root.appendChild(viewport);
    container.appendChild(root);
    const openFile = adapters.openFile || (() => {});

    const applyPan = () => {
      scene.style.transform = `translate(${state.x}px, ${state.y}px)`;
      zoomLabel.textContent = uiText("timeline.zoomLabel", { percent: Math.round((state.daySpacing / baseSpacing) * 100), spacing: state.daySpacing.toFixed(state.daySpacing < 10 ? 1 : 0) });
    };

    const renderGeometry = () => {
      scene.replaceChildren();
      const viewportWidth = Math.max(720, viewport.clientWidth || 1200);
      state.sceneWidth = Math.max(viewportWidth, sidePadding * 2 + rangeDays * state.daySpacing);

      const positionedItems = items.map((item) => ({
        item,
        time: item.completedTime,
        x: sidePadding + Math.round((item.completedTime - minTime) / DAY_MS) * state.daySpacing,
      }));
      const laidOutItems = assignTimelineLanes(positionedItems, CARD_WIDTH + CARD_GAP_X);
      const laneCount = Math.max(1, ...laidOutItems.map((positioned) => positioned.lane + 1));
      const aboveLaneCount = Math.ceil(laneCount / 2);
      const belowLaneCount = Math.floor(laneCount / 2);
      const axisY = SCENE_PADDING_Y + STEM_GAP
        + aboveLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y;
      state.sceneHeight = axisY + SCENE_PADDING_Y
        + (belowLaneCount > 0
          ? STEM_GAP + belowLaneCount * (CARD_HEIGHT + CARD_GAP_Y) - CARD_GAP_Y
          : 0);

      scene.style.width = `${state.sceneWidth}px`;
      scene.style.height = `${state.sceneHeight}px`;

      const axis = makeEl("div", "al-timeline-axis");
      axis.style.left = `${sidePadding}px`;
      axis.style.top = `${axisY}px`;
      axis.style.width = `${Math.max(1, rangeDays * state.daySpacing)}px`;
      scene.appendChild(axis);

      const tickStep = tickStepForSpacing(state.daySpacing);
      for (let day = 0; day <= rangeDays; day += tickStep) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + day * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(minTime + day * DAY_MS)));
        scene.appendChild(tick);
      }
      if (rangeDays % tickStep !== 0) {
        const tick = makeEl("div", "al-timeline-tick");
        tick.style.left = `${sidePadding + rangeDays * state.daySpacing}px`;
        tick.style.top = `${axisY - 7}px`;
        tick.appendChild(makeEl("span", "", formatDate(maxTime)));
        scene.appendChild(tick);
      }

      dates.forEach((time) => {
        const x = sidePadding + Math.round((time - minTime) / DAY_MS) * state.daySpacing;
        const dayMarker = makeEl("div", "al-timeline-day-marker");
        dayMarker.style.left = `${x - 5}px`;
        dayMarker.style.top = `${axisY - 5}px`;
        scene.appendChild(dayMarker);
      });

      laidOutItems.forEach(({ item, time, x, lane }) => {
        const level = Math.floor(lane / 2);
        const aboveAxis = lane % 2 === 0;
        const cardY = aboveAxis
          ? axisY - STEM_GAP - CARD_HEIGHT - level * (CARD_HEIGHT + CARD_GAP_Y)
          : axisY + STEM_GAP + level * (CARD_HEIGHT + CARD_GAP_Y);
        const stemStart = aboveAxis ? cardY + CARD_HEIGHT : axisY;
        const stemEnd = aboveAxis ? axisY : cardY;
        const stem = makeEl("div", "al-timeline-stem");
        stem.style.left = `${x}px`;
        stem.style.top = `${stemStart}px`;
        stem.style.height = `${Math.max(1, stemEnd - stemStart)}px`;
        scene.appendChild(stem);

        const card = makeEl("button", "al-timeline-card");
        card.type = "button";
        card.dataset.timelineLane = String(lane);
        card.style.left = `${x - CARD_WIDTH / 2}px`;
        card.style.top = `${cardY}px`;
        card.title = uiText("timeline.cardTitle", { title: item.title, date: formatDate(time) });
        if (item.cover) {
          const image = makeEl("img", "", "");
          image.src = item.cover;
          image.alt = uiText("timeline.coverAlt", { title: item.title });
          card.appendChild(image);
        }
        const text = makeEl("span", "al-timeline-card-copy");
        const displayTitle = item.seriesTitle || item.title;
        text.appendChild(makeEl("strong", "", displayTitle));
        if (item.volumeLabel) {
          text.appendChild(makeEl("span", "al-timeline-volume-label", uiText("timeline.volumeLabel", { volume: item.volumeLabel })));
        }
        text.appendChild(makeEl("small", "", formatDate(time)));
        card.appendChild(text);
        if (item.score != null) card.appendChild(makeEl("span", "al-timeline-score", `★ ${Number(item.score).toFixed(1)}`));
        card.addEventListener("click", () => openFile(item.filePath));
        scene.appendChild(card);
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
      state.y = (viewport.clientHeight - state.sceneHeight) / 2;
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
      totalItems: allItems.length,
      type: selectedType,
      fitScene,
      getDaySpacing: () => state.daySpacing,
      getSceneWidth: () => state.sceneWidth,
    };
  }

  return { render };
})();

function createLabeledField(parent, labelText, input, hintText = "") {
  const wrapper = createEl("label");
  wrapper.className = "al-form-field";
  const label = createSpan();
  label.className = "al-form-label";
  label.textContent = labelText;
  wrapper.append(label, input);
  if (hintText) wrapper.appendChild(makeEl("small", "al-form-hint", hintText));
  parent.appendChild(wrapper);
  return input;
}

function createTextInput(type = "text", value = "") {
  const input = createEl("input");
  input.type = type;
  input.value = value == null ? "" : String(value);
  return input;
}

function createSelect(options, selected) {
  const select = createEl("select");
  options.forEach(([value, text]) => {
    const option = createEl("option");
    option.value = value;
    option.textContent = text;
    option.selected = value === selected;
    select.appendChild(option);
  });
  return select;
}

function bindCompletionBehavior(status, total, progress, completedAt, noteEl = null, mediaType = "anime") {
  const sync = () => {
    const completed = status.value === "completed";
    const autoProgress = mediaType === "anime" && completed;
    progress.readOnly = autoProgress;
    progress.classList.toggle("is-auto", autoProgress);
    if (autoProgress) {
      const normalizedTotal = Math.max(0, numeric(total?.value));
      if (normalizedTotal > 0) progress.value = progressDisplayValue(normalizedTotal);
      if (completedAt && !completedAt.value) completedAt.value = todayString();
    } else if (completed && completedAt && !completedAt.value) {
      completedAt.value = todayString();
    }
    if (completedAt) completedAt.required = completed;
    if (noteEl) {
      if (mediaType === "anime") {
        noteEl.textContent = completed
          ? uiText("completion.animeCompleted", { status: completedStatusLabel("anime") })
          : uiText("completion.animeActive");
      } else {
        noteEl.textContent = completed
          ? uiText("completion.readingCompleted")
          : uiText("completion.readingActive");
      }
    }
  };
  status.addEventListener("change", sync);
  total?.addEventListener("input", sync);
  sync();
  return sync;
}

function bindScoreRequirement(status, score, mediaType = "anime") {
  const sync = () => {
    const required = status.value === "completed";
    score.required = required;
    score.setAttribute("aria-required", required ? "true" : "false");
    score.placeholder = required
      ? uiText("completion.requiredPlaceholder", { status: completedStatusLabel(mediaType === "anime" ? "anime" : mediaType === "manga" ? "manga" : "novel") })
      : uiText("common.optional");
  };
  status.addEventListener("change", sync);
  sync();
  return sync;
}

function genreInputValues(input) {
  return normalizeGenres(String(input?.value || "").split(/[、,，;；\n]+/));
}

function releaseStatusOptions(selected = "unknown") {
  return createSelect([
    ["releasing", uiText("media.release.releasing")],
    ["finished", uiText("media.release.finished")],
    ["hiatus", uiText("media.release.hiatus")],
    ["cancelled", uiText("media.release.cancelled")],
    ["unknown", uiText("media.release.unknown")],
  ], normalizeReleaseStatus(selected));
}

function validateNovelProgress(value, label, optional = false) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text && optional) return 0;
  if (!text || text === "0") return 0;
  const normalized = normalizeVolumeLabel(text);
  if (normalized === null) throw new Error(uiText("validation.volumeFormat", { label }));
  return normalized === "EX" ? "EX" : Number(normalized);
}

function createNovelVolumeEditor(parent, initialEntries = []) {
  const section = makeEl("section", "al-volume-editor");
  const header = makeEl("div", "al-volume-editor-header");
  const copy = makeEl("div", "");
  copy.append(
    makeEl("strong", "", uiText("volume.title")),
    makeEl("small", "", uiText("volume.description")),
  );
  const add = makeEl("button", "al-secondary-button", uiText("volume.add"));
  add.type = "button";
  header.append(copy, add);
  const rows = makeEl("div", "al-volume-editor-rows");
  section.append(header, rows);
  parent.appendChild(section);

  const entries = normalizeVolumeLog(initialEntries).map((entry) => ({ ...entry }));

  const nextLabel = () => {
    const numericLabels = entries
      .map((entry) => normalizeVolumeLabel(entry.label))
      .filter((label) => label && label !== "EX")
      .map(Number)
      .filter(Number.isFinite);
    return numericLabels.length ? String(Math.floor(Math.max(...numericLabels)) + 1) : "1";
  };

  const revealVolumeRow = (row, labelInput, { highlight = false, select = false } = {}) => {
    if (highlight) row.classList.add("al-volume-row-new");
    const reveal = () => {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      labelInput.focus({ preventScroll: true });
      if (select) labelInput.select();
      if (highlight) {
        row.ownerDocument.defaultView?.setTimeout(() => row.classList.remove("al-volume-row-new"), 1400);
      }
    };
    const view = row.ownerDocument.defaultView;
    if (view?.requestAnimationFrame) view.requestAnimationFrame(() => view.requestAnimationFrame(reveal));
    else view?.setTimeout(reveal, 0);
  };

  const render = ({ revealEntry = null, highlightEntry = false, selectLabel = false } = {}) => {
    rows.replaceChildren();
    entries.sort((left, right) => compareVolumeLabels(left.label, right.label));
    if (!entries.length) {
      rows.appendChild(makeEl("p", "al-volume-editor-empty", uiText("volume.empty")));
    }

    entries.forEach((entry, index) => {
      const row = makeEl("div", "al-volume-row");
      const fields = makeEl("div", "al-volume-row-fields");
      const labelInput = createLabeledField(fields, uiText("volume.label"), createTextInput("text", entry.label), uiText("volume.labelPlaceholder"));
      const startedInput = createLabeledField(fields, uiText("volume.startedAt"), createTextInput("date", entry.startedAt || ""));
      const completedInput = createLabeledField(fields, uiText("volume.completedAt"), createTextInput("date", entry.completedAt || todayString()), uiText("volume.completedHint"));
      if (!entry.completedAt) entry.completedAt = completedInput.value;
      const actions = makeEl("div", "al-volume-row-actions");
      const remove = makeEl("button", "al-delete-button", uiText("action.remove"));
      remove.type = "button";
      actions.appendChild(remove);
      row.append(fields, actions);
      rows.appendChild(row);

      labelInput.addEventListener("input", () => { entry.label = labelInput.value; });
      labelInput.addEventListener("change", () => {
        const normalizedLabel = normalizeVolumeLabel(labelInput.value);
        if (!normalizedLabel) return;
        entry.label = normalizedLabel;
        render({ revealEntry: entry });
      });
      startedInput.addEventListener("input", () => { entry.startedAt = startedInput.value; });
      completedInput.addEventListener("input", () => { entry.completedAt = completedInput.value; });
      completedInput.addEventListener("change", () => {
        if (!completedInput.value) completedInput.value = todayString();
        entry.completedAt = completedInput.value;
      });
      remove.addEventListener("click", () => {
        entries.splice(index, 1);
        render();
      });

      if (entry === revealEntry) {
        revealVolumeRow(row, labelInput, { highlight: highlightEntry, select: selectLabel });
      }
    });
  };

  add.addEventListener("click", () => {
    const entry = { label: nextLabel(), startedAt: "", completedAt: todayString() };
    entries.push(entry);
    render({ revealEntry: entry, highlightEntry: true, selectLabel: true });
  });
  render();

  return {
    getEntries() {
      const output = [];
      const seen = new Set();
      for (const entry of entries) {
        const label = normalizeVolumeLabel(entry.label);
        if (!label) throw new Error(uiText("validation.volumeInvalid", { value: entry.label || uiText("common.emptyValue") }));
        if (seen.has(label)) throw new Error(uiText("validation.volumeDuplicate", { volume: label }));
        seen.add(label);
        output.push({
          label,
          startedAt: entry.startedAt || "",
          completedAt: entry.completedAt || todayString(),
        });
      }
      return output.sort((left, right) => compareVolumeLabels(left.label, right.label));
    },
  };
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
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const headingCopy = makeEl("div");
    headingCopy.append(
      makeEl("div", "al-kicker", uiText("add.kicker")),
      makeEl("h2", "", uiText("add.title")),
      makeEl("p", "", uiText("add.description")),
    );
    heading.appendChild(headingCopy);
    this.contentEl.appendChild(heading);

    const typeTabs = createDiv();
    typeTabs.className = "al-modal-type-tabs";
    [["anime", LABEL.type.anime], ["manga", LABEL.type.manga], ["novel", LABEL.type.novel]].forEach(([value, text]) => {
      const button = createEl("button");
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

    const searchRow = createDiv();
    searchRow.className = "al-modal-search-row";
    const input = createTextInput("search", this.query);
    input.placeholder = this.mediaType === "anime" ? uiText("add.placeholderAnime") : this.mediaType === "manga" ? uiText("add.placeholderManga") : uiText("add.placeholderNovel");
    const button = createEl("button");
    button.type = "button";
    button.className = "mod-cta";
    button.textContent = uiText("action.search");
    const runSearch = () => {
      this.query = input.value.trim();
      if (!this.query) { new Notice(uiText("notice.searchQueryRequired")); return; }
      this.search(button);
    };
    button.addEventListener("click", runSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
    searchRow.append(input, button);
    this.contentEl.appendChild(searchRow);

    const hint = createEl("p");
    hint.className = "al-modal-hint";
    hint.textContent = this.mediaType === "novel"
      ? uiText("add.hintNovel")
      : uiText("add.hintMedia");
    this.contentEl.appendChild(hint);

    if (this.warnings.length) {
      const warning = createDiv();
      warning.className = "al-modal-warning";
      warning.textContent = uiText("add.warning", { warnings: this.warnings.join("；") });
      this.contentEl.appendChild(warning);
    }

    const resultsEl = createDiv();
    resultsEl.className = "al-search-results";
    if (!this.results.length && this.query) {
      const empty = createDiv();
      empty.className = "al-search-empty";
      empty.textContent = uiText("add.emptyResult");
      resultsEl.appendChild(empty);
    }
    this.results.forEach((result) => resultsEl.appendChild(this.createResultRow(result)));
    this.contentEl.appendChild(resultsEl);
    window.setTimeout(() => input.focus(), 0);
  }

  async search(button) {
    button.disabled = true;
    button.textContent = uiText("add.searching");
    try {
      const response = await this.plugin.searchExternal(this.mediaType, this.query);
      this.results = response.results;
      this.warnings = response.warnings;
      if (!this.results.length) new Notice(uiText("notice.searchNoResults"));
    } catch (error) {
      console.error("AnimeList external search failed", error);
      this.results = [];
      this.warnings = [error?.message || String(error)];
      new Notice(uiText("notice.searchUnavailable"));
    }
    this.renderSearch();
  }

  createResultRow(result) {
    const row = createEl("button");
    row.type = "button";
    row.className = "al-search-result";
    if (result.coverUrl) {
      const image = createEl("img");
      image.src = result.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      row.appendChild(image);
    } else {
      const placeholder = createDiv();
      placeholder.className = "al-search-result-placeholder";
      placeholder.textContent = uiText("add.noCover");
      row.appendChild(placeholder);
    }
    const body = createDiv();
    body.className = "al-search-result-body";
    const title = createEl("strong");
    title.textContent = result.title;
    const original = createSpan();
    original.textContent = result.originalTitle || result.romajiTitle || "";
    const meta = createSpan();
    meta.textContent = [mediaProviderLabel(result.provider), result.year || uiText("add.unknownYear"), mediaFormatLabel(result.format)].filter(Boolean).join(" · ");
    body.append(title, original, meta);
    const use = createSpan();
    use.className = "al-search-result-use";
    use.textContent = uiText("action.select");
    row.append(body, use);
    row.addEventListener("click", () => this.renderDetails(result));
    return row;
  }

  async renderDetails(result) {
    this.contentEl.replaceChildren();
    const back = createEl("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = uiText("action.back");
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const preview = createDiv();
    preview.className = "al-selected-preview";
    if (result.coverUrl) {
      const image = createEl("img");
      image.src = result.coverUrl;
      image.alt = uiText("library.coverAlt", { title: result.title });
      preview.appendChild(image);
    }
    const copy = createDiv();
    copy.append(
      makeEl("div", "al-kicker", mediaProviderLabel(result.provider)),
      makeEl("h2", "", result.title),
      makeEl("p", "", result.originalTitle || result.romajiTitle || ""),
    );
    preview.appendChild(copy);
    this.contentEl.appendChild(preview);

    const templates = await this.plugin.getTemplates(result.mediaType);
    const form = createDiv();
    form.className = "al-media-form";
    const titleInput = createLabeledField(form, uiText("add.titleLabel"), createTextInput("text", result.title), uiText("add.required"));
    titleInput.required = true;
    const statusOptions = result.mediaType === "anime"
      ? [["planned", uiText("media.status.plannedAnime")], ["watching", uiText("media.status.watching")], ["completed", uiText("media.status.completedAnime")], ["on_hold", uiText("media.status.pausedAnime")], ["dropped", uiText("media.status.droppedAnime")]]
      : [["planned", uiText("media.status.plannedReading")], ["reading", uiText("media.status.reading")], ["completed", uiText("media.status.completedReading")], ["on_hold", uiText("media.status.pausedReading")], ["dropped", uiText("media.status.droppedReading")]];
    const status = createLabeledField(form, uiText("add.statusLabel"), createSelect(statusOptions, "planned"));
    const releaseStatus = result.mediaType === "anime"
      ? null
      : createLabeledField(form, uiText("add.releaseStatusLabel"), releaseStatusOptions(result.releaseStatus));
    const score = createLabeledField(form, uiText("add.scoreLabel"), createTextInput("number", ""), uiText("add.scoreHint", { status: completedStatusLabel(result.mediaType) }));
    score.min = "0"; score.max = "10"; score.step = "0.1";
    bindScoreRequirement(status, score, result.mediaType);
    const startedAt = createLabeledField(form, uiText("add.startedAt"), createTextInput("date", ""), uiText("add.startedHint"));
    const completedAt = createLabeledField(form, uiText("add.completedAt"), createTextInput("date", ""), uiText("add.completedHint", { status: completedStatusLabel(result.mediaType) }));
    const progressType = result.mediaType === "novel" ? "text" : "number";
    const progressLabel = result.mediaType === "manga" ? uiText("add.progressManga") : result.mediaType === "novel" ? uiText("add.progressNovel") : uiText("add.progressAnime");
    const progress = createLabeledField(form, progressLabel, createTextInput(progressType, "0"), result.mediaType === "novel" ? uiText("add.progressNovelHint") : "");
    if (result.mediaType !== "novel") { progress.min = "0"; progress.step = "1"; }
    const total = result.mediaType === "anime"
      ? createLabeledField(form, uiText("add.total"), createTextInput("number", result.total || ""))
      : null;
    if (total) { total.min = "0"; total.step = "1"; }
    const unitOptions = result.mediaType === "anime"
      ? [["episode", uiText("media.unit.episode")]]
      : result.mediaType === "manga"
        ? [["chapter", uiText("media.unit.chapter")]]
        : [["volume", uiText("media.unit.volume")]];
    const unit = createLabeledField(form, uiText("add.unit"), createSelect(unitOptions, unitOptions[0][0]));
    const genreInput = createLabeledField(form, uiText("add.genres"), createTextInput("text", normalizeGenres(result.genres).join("、")), uiText("add.genresHint"));
    const templateOptions = templates.length
      ? templates.map((template) => [template.path, template.name])
      : [["", uiText("add.noTemplate")]];
    const templateSelect = createLabeledField(form, uiText("add.template"), createSelect(templateOptions, templateOptions[0][0]), uiText("add.templateHint"));
    const completionNote = makeEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote, result.mediaType);
    const volumeEditor = result.mediaType === "novel"
      ? createNovelVolumeEditor(form, [])
      : null;
    const favoriteWrap = createEl("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = createEl("input");
    favorite.type = "checkbox";
    favoriteWrap.append(favorite, ` ${uiText("add.favorite")}`);
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const sourceNote = createDiv();
    sourceNote.className = "al-source-note";
    sourceNote.textContent = result.mediaType === "novel"
      ? uiText("add.sourceNovel")
      : uiText("add.sourceMedia");
    this.contentEl.appendChild(sourceNote);

    const actions = createDiv();
    actions.className = "al-modal-actions";
    const createButton = createEl("button");
    createButton.type = "button";
    createButton.className = "mod-cta";
    createButton.textContent = uiText("action.add");
    createButton.addEventListener("click", async () => {
      if (!titleInput.value.trim()) { new Notice(uiText("validation.titleRequired")); return; }
      const hasScore = score.value.trim() !== "";
      const scoreValue = hasScore ? Number(score.value) : null;
      if (status.value === "completed" && !hasScore) { new Notice(`${completedRequirementMessage(result.mediaType, uiText("field.score"))}。`); return; }
      if (hasScore && (scoreValue == null || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 10)) { new Notice(`${uiText("validation.scoreRange")}。`); return; }
      if (status.value === "completed" && !completedAt.value) { new Notice(`${completedRequirementMessage(result.mediaType, uiText("field.completedAt"))}。`); return; }
      createButton.disabled = true;
      createButton.textContent = uiText("add.processing");
      try {
        const volumeLog = volumeEditor ? volumeEditor.getEntries() : [];
        let nextProgress = result.mediaType === "novel" ? validateNovelProgress(progress.value, uiText("add.progressNovel")) : Math.max(0, numeric(progress.value));
        const nextTotal = result.mediaType === "anime" ? Math.max(0, numeric(total?.value)) : 0;
        const completedVolume = highestCompletedVolume(volumeLog);
        if (result.mediaType === "novel" && completedVolume && compareVolumeLabels(nextProgress, completedVolume) < 0) nextProgress = completedVolume === "EX" ? "EX" : Number(completedVolume);
        const file = await this.plugin.createMediaNote(result, {
          title: titleInput.value.trim(), status: status.value, releaseStatus: releaseStatus?.value || "unknown", score: score.value,
          startedAt: startedAt.value, completedAt: completedAt.value,
          progress: nextProgress, total: nextTotal, unit: unit.value,
          favorite: favorite.checked, genres: genreInputValues(genreInput), templatePath: templateSelect.value, volumeLog,
        });
        this.close();
        new Notice(uiText("notice.collected", { title: titleInput.value.trim() }));
        await this.plugin.app.workspace.openLinkText(file.path, "", false);
      } catch (error) {
        console.error("AnimeList create note failed", error);
        new Notice(uiText("notice.createFailed", { error: error?.message || error }));
        createButton.disabled = false;
        createButton.textContent = uiText("action.add");
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
    const title = makeEl("h2", "", uiText("delete.title"));
    const description = makeEl("p", "", uiText("delete.description", { title: fm.title || this.file.basename }));
    const actions = makeEl("div", "al-modal-actions al-confirm-actions");
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const remove = makeEl("button", "mod-warning", uiText("action.delete"));
    remove.type = "button";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await this.plugin.deleteMediaFile(this.file);
        this.close();
        if (this.onDeleted) this.onDeleted();
        new Notice(uiText("notice.deleted"));
      } catch (error) {
        console.error("AnimeList delete failed", error);
        new Notice(uiText("notice.deleteFailed", { error: error?.message || error }));
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
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const title = createEl("h2");
    title.textContent = uiText("edit.title", { title: frontmatter.title || this.file.basename });
    const description = createEl("p");
    description.textContent = uiText("edit.description");
    heading.append(title, description);
    this.contentEl.appendChild(heading);

    const mediaType = String(frontmatter.media_type || "anime");
    const form = createDiv();
    form.className = "al-media-form";
    const statusOptions = mediaType === "anime"
      ? [["planned", uiText("media.status.plannedAnime")], ["watching", uiText("media.status.watching")], ["completed", uiText("media.status.completedAnime")], ["on_hold", uiText("media.status.pausedAnime")], ["dropped", uiText("media.status.droppedAnime")]]
      : [["planned", uiText("media.status.plannedReading")], ["reading", uiText("media.status.reading")], ["completed", uiText("media.status.completedReading")], ["on_hold", uiText("media.status.pausedReading")], ["dropped", uiText("media.status.droppedReading")]];
    const titleInput = createLabeledField(form, uiText("add.titleLabel"), createTextInput("text", frontmatter.title || this.file.basename), uiText("add.required"));
    titleInput.required = true;
    const currentStatus = String(frontmatter.status || "planned");
    const status = createLabeledField(form, uiText("add.statusLabel"), createSelect(statusOptions, currentStatus));
    const releaseStatus = mediaType === "anime"
      ? null
      : createLabeledField(form, uiText("add.releaseStatusLabel"), releaseStatusOptions(frontmatter.release_status));
    const score = createLabeledField(form, uiText("add.scoreLabel"), createTextInput("number", frontmatter.score ?? ""), uiText("add.scoreHint", { status: completedStatusLabel(mediaType) }));
    score.min = "0"; score.max = "10"; score.step = "0.1";
    bindScoreRequirement(status, score, mediaType);
    const progressType = mediaType === "novel" ? "text" : "number";
    const progressLabel = mediaType === "manga" ? uiText("add.progressManga") : mediaType === "novel" ? uiText("add.progressNovel") : uiText("add.progressAnime");
    const progress = createLabeledField(form, progressLabel, createTextInput(progressType, frontmatter.progress ?? 0), mediaType === "novel" ? uiText("add.progressNovelHint") : "");
    if (mediaType !== "novel") progress.min = "0";
    const total = mediaType === "anime"
      ? createLabeledField(form, uiText("add.total"), createTextInput("number", frontmatter.progress_total ?? ""))
      : null;
    if (total) total.min = "0";
    const startedAt = createLabeledField(form, uiText("add.startedAt"), createTextInput("date", frontmatter.started_at || ""), uiText("add.startedHint"));
    const completedAt = createLabeledField(form, uiText("add.completedAt"), createTextInput("date", frontmatter.completed_at || ""), uiText("add.completedHint", { status: completedStatusLabel(mediaType) }));
    const genreInput = createLabeledField(form, uiText("add.genres"), createTextInput("text", normalizeGenres(frontmatter.genres).join("、")), uiText("add.genresHint"));
    const completionNote = makeEl("div", "al-completion-note");
    form.appendChild(completionNote);
    bindCompletionBehavior(status, total, progress, completedAt, completionNote, mediaType);
    const volumeEditor = mediaType === "novel"
      ? createNovelVolumeEditor(form, frontmatter.volume_log)
      : null;
    const favoriteWrap = createEl("label");
    favoriteWrap.className = "al-form-checkbox";
    const favorite = createEl("input");
    favorite.type = "checkbox";
    favorite.checked = frontmatter.favorite === true;
    favoriteWrap.append(favorite, ` ${uiText("add.favorite")}`);
    form.appendChild(favoriteWrap);
    this.contentEl.appendChild(form);

    const actions = createDiv();
    actions.className = "al-modal-actions al-edit-actions";
    const deleteButton = createEl("button");
    deleteButton.type = "button";
    deleteButton.className = "al-delete-button";
    appendIconLabel(deleteButton, "trash", uiText("action.delete"));
    deleteButton.addEventListener("click", () => {
      new ConfirmDeleteModal(this.plugin, this.file, () => this.close()).open();
    });
    const save = createEl("button");
    save.type = "button";
    save.className = "mod-cta";
    save.textContent = uiText("action.save");
    save.addEventListener("click", async () => {
      const nextTitle = titleInput.value.trim();
      const hasScore = score.value.trim() !== "";
      const nextScore = hasScore ? Number(score.value) : null;
      if (!nextTitle) { new Notice(uiText("validation.titleRequired")); return; }
      if (status.value === "completed" && !hasScore) { new Notice(`${completedRequirementMessage(mediaType, uiText("field.score"))}。`); return; }
      if (hasScore && (nextScore == null || !Number.isFinite(nextScore) || nextScore < 0 || nextScore > 10)) { new Notice(`${uiText("validation.scoreRange")}。`); return; }
      if (status.value === "completed" && !completedAt.value) { new Notice(`${completedRequirementMessage(mediaType, uiText("field.completedAt"))}。`); return; }
      save.disabled = true;
      try {
        const volumeLog = volumeEditor ? volumeEditor.getEntries() : [];
        const nextTotal = mediaType === "anime" ? Math.max(0, numeric(total?.value)) : 0;
        let nextProgress = mediaType === "novel"
          ? validateNovelProgress(progress.value, uiText("add.progressNovel"))
          : Math.max(0, numeric(progress.value));
        const completedVolume = highestCompletedVolume(volumeLog);
        if (mediaType === "novel" && completedVolume && compareVolumeLabels(nextProgress, completedVolume) < 0) nextProgress = completedVolume === "EX" ? "EX" : Number(completedVolume);
        await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => {
          fm.schema_version = 5;
          fm.title = nextTitle;
          fm.status = status.value;
          if (mediaType !== "anime") fm.release_status = releaseStatus?.value || "unknown";
          if (mediaType === "anime") fm.progress_total = nextTotal;
          else delete fm.progress_total;
          fm.progress = completedProgress(status.value, nextTotal, nextProgress, mediaType);
          fm.favorite = favorite.checked;
          fm.genres = genreInputValues(genreInput);
          if (nextScore != null) fm.score = nextScore; else delete fm.score;
          if (startedAt.value) fm.started_at = startedAt.value; else delete fm.started_at;
          if (completedAt.value) fm.completed_at = completedAt.value; else delete fm.completed_at;
          if (mediaType === "novel" && volumeLog.length) fm.volume_log = serializeVolumeLog(volumeLog); else delete fm.volume_log;
          delete fm.updated_at;
          delete fm.metadata_updated_at;
        });
        this.close();
        new Notice(uiText("notice.saved"));
      } catch (error) {
        console.error("AnimeList edit failed", error);
        new Notice(uiText("notice.saveFailed", { error: error?.message || error }));
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
    const bar = makeEl("div", "al-detail-actions");
    const summary = makeEl("div", "al-detail-summary");
    const detailItem = {
      status: fm.status || "planned", mediaType: fm.media_type || "anime", releaseStatus: normalizeReleaseStatus(fm.release_status),
      progress: normalizeProgressValue(fm.progress), total: String(fm.media_type || "anime") === "anime" ? normalizeProgressValue(fm.progress_total) : 0, unit: fm.progress_unit || "",
    };
    const status = makeEl("span", `al-status status-${detailItem.status}`, itemStatusLabel(detailItem));
    const unitLabel = LABEL.unit[detailItem.unit] || detailItem.unit || "";
    const hasTotal = detailItem.total !== 0 && detailItem.total !== "";
    const progress = makeEl("span", "", hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0 ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel }) : uiText("detail.noProgress"));
    summary.append(status, progress);
    if (fm.score != null && fm.score !== "") summary.appendChild(makeEl("span", "al-detail-score", `★ ${Number(fm.score).toFixed(1)}`));
    const actions = makeEl("div", "al-detail-buttons");
    const favorite = makeEl("button", `al-detail-favorite${fm.favorite === true ? " is-active" : ""}`, fm.favorite === true ? uiText("detail.favorite") : uiText("detail.favoriteAdd"));
    favorite.type = "button";
    favorite.addEventListener("click", () => this.plugin.setFavorite(file.path, fm.favorite !== true));
    const edit = makeEl("button", "", uiText("action.edit"));
    edit.type = "button";
    edit.addEventListener("click", () => this.plugin.openEditModal(file.path));
    const library = makeEl("button", "", uiText("detail.library"));
    library.type = "button";
    library.addEventListener("click", () => this.plugin.openLibrary());
    actions.append(favorite, edit, library);
    const urls = asArray(fm.source_urls).filter(Boolean);
    if (urls[0]) {
      const external = makeEl("button");
      external.type = "button";
      appendIconLabel(external, "external", uiText("detail.source"));
      external.addEventListener("click", () => window.open(String(urls[0]), "_blank"));
      actions.appendChild(external);
    }
    const remove = makeEl("button", "al-detail-delete", uiText("action.delete"));
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
    this.addCommand({ id: "open-library", name: uiText("app.openLibrary"), callback: () => this.app.workspace.openLinkText("Dashboard/Library", "", false) });
    this.addCommand({ id: "add-media", name: uiText("action.collect"), callback: () => this.openAddModal("anime") });
    this.addCommand({ id: "open-timeline", name: uiText("app.openTimeline"), callback: () => this.openTimeline() });
  }

  openAddModal(initialType = "anime") {
    new AddMediaModal(this, initialType).open();
  }

  openEditModal(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) { new Notice(uiText("notice.mediaNoteMissing")); return; }
    new EditMediaModal(this, file).open();
  }

  openTimeline() {
    new TimelineModal(this, this.collectMediaItems(MEDIA_ROOT)).open();
  }

  collectMediaItems(source = MEDIA_ROOT) {
    const root = String(source || MEDIA_ROOT).replace(/^\/+|\/+$/g, "");
    return getScopedMarkdownFiles(this.app, [root])
      .map((file) => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm || !fm.media_type) return null;
        const coverPath = stringValue(fm.cover).replace(/^!\[\[/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0];
        let cover = "";
        if (/^https?:\/\//i.test(coverPath)) cover = coverPath;
        else if (coverPath) {
          const coverFile = this.app.metadataCache.getFirstLinkpathDest(coverPath, file.path) || this.app.vault.getAbstractFileByPath(coverPath);
          if (coverFile) cover = this.app.vault.getResourcePath(coverFile);
        }
        const people = asArray(fm.studios).length ? asArray(fm.studios) : asArray(fm.authors).length ? asArray(fm.authors) : asArray(fm.creators);
        return {
          title: stringValue(fm.title, file.basename), originalTitle: stringValue(fm.title_original, stringValue(fm.title_romaji)),
          mediaType: stringValue(fm.media_type), format: stringValue(fm.format, stringValue(fm.media_type)), status: stringValue(fm.status, "planned"),
          releaseStatus: normalizeReleaseStatus(fm.release_status), progress: normalizeProgressValue(fm.progress), total: stringValue(fm.media_type) === "anime" ? normalizeProgressValue(fm.progress_total) : 0, unit: stringValue(fm.progress_unit), score: fm.score,
          favorite: fm.favorite === true, year: fm.year || "", genres: normalizeGenres(fm.genres), people,
          platforms: asArray(fm.platforms), sourceUrls: asArray(fm.source_urls), cover, filePath: file.path,
          updated: Number(file.stat?.mtime || 0), updatedLabel: file.stat?.mtime ? uiText("library.updatedAt", { date: formatFileModifiedTime(file.stat.mtime) }) : "",
          startedAt: fm.started_at || "", completedAt: fm.completed_at || "",
          volumeLog: normalizeVolumeLog(fm.volume_log),
        };
      }).filter(Boolean);
  }

  async setFavorite(path, next) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(uiText("validation.mediaNoteMissing"));
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.favorite = next === true;
      delete fm.updated_at;
      delete fm.metadata_updated_at;
    });
    new Notice(uiText(next ? "notice.favoriteAdded" : "notice.favoriteRemoved"));
  }

  async deleteMediaFile(file) {
    await this.app.fileManager.trashFile(file);
  }

  async getTemplates(mediaType) {
    const typeFolder = mediaType === "anime" ? "Anime" : mediaType === "manga" ? "Manga" : "Novel";
    const files = getScopedMarkdownFiles(this.app, [TEMPLATE_ROOT]).filter((file) => {
      if (!file.path.startsWith(`${TEMPLATE_ROOT}/`)) return false;
      const relative = file.path.slice(TEMPLATE_ROOT.length + 1);
      return !relative.includes("/") || relative.startsWith("Common/") || relative.startsWith(`${typeFolder}/`);
    });
    return files.sort((a, b) => a.path.localeCompare(b.path, "zh-Hant")).map((file) => ({
      path: file.path,
      name: file.path.startsWith(`${TEMPLATE_ROOT}/Common/`) ? uiText("common.sharedName", { name: file.basename }) : file.basename,
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
            id siteUrl type format status episodes chapters volumes averageScore description(asHtml: false) genres synonyms
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
    return getScopedMarkdownFiles(this.app, [MEDIA_ROOT]).find((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return fm && stringValue(fm.source_provider) === String(provider) && stringValue(fm.source_id) === String(sourceId);
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
    const hasScore = form?.score !== "" && form?.score != null;
    const score = hasScore ? Number(form.score) : null;
    const completedAt = String(form?.completedAt || "").trim();
    if (!title) throw new Error(uiText("validation.titleRequired"));
    if (form?.status === "completed" && !hasScore) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.score")));
    if (hasScore && (score == null || !Number.isFinite(score) || score < 0 || score > 10)) throw new Error(uiText("validation.scoreRange"));
    if (form?.status === "completed" && !completedAt) throw new Error(completedRequirementMessage(result.mediaType, uiText("field.completedAt")));
    const existing = this.findExistingBySource(result.provider, result.sourceId);
    if (existing) {
      new Notice(uiText("notice.existingMedia"));
      await this.app.workspace.openLinkText(existing.path, "", false);
      return existing;
    }
    let coverPath = "";
    if (result.coverUrl) {
      try { coverPath = await this.downloadCover(result); }
      catch (error) {
        console.warn("AnimeList cover download failed; using remote URL", error);
        new Notice(uiText("notice.coverRemote"));
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
  ensureDetailBlock, AnimeListUI, TimelineUI, assignTimelineLanes, filterTimelineEntries,
};

export default LegacyAnimeListPlugin;

/* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- End legacy compatibility-layer lint scope. */

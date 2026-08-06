import { asArray, stringValue } from "./value-normalization";

const GENRE_ALIASES = new Map(Object.entries({
  romance: "戀愛", love: "戀愛", 恋爱: "戀愛", 戀愛: "戀愛", 爱情: "戀愛",
  comedy: "喜劇", 喜剧: "喜劇", 喜劇: "喜劇", 搞笑: "喜劇",
  fantasy: "奇幻", 奇幻: "奇幻", 魔法: "魔法",
  adventure: "冒險", 冒险: "冒險", 冒險: "冒險",
  action: "動作", 动作: "動作", 動作: "動作", 戰鬥: "動作", 战斗: "動作",
  drama: "劇情", 剧情: "劇情", 劇情: "劇情",
  "slice of life": "日常", "slice-of-life": "日常", 日常: "日常",
  school: "校園", "school life": "校園", 校园: "校園", 校園: "校園",
  psychological: "心理", 心理: "心理", 心理戰: "心理",
  mystery: "懸疑", 悬疑: "懸疑", 推理: "懸疑", 懸疑: "懸疑",
  thriller: "驚悚", 惊悚: "驚悚", 驚悚: "驚悚",
  horror: "恐怖", 恐怖: "恐怖",
  "sci-fi": "科幻", "science fiction": "科幻", 科幻: "科幻",
  supernatural: "超自然", 超自然: "超自然",
  sports: "運動", 运动: "運動", 運動: "運動",
  music: "音樂", 音乐: "音樂", 音樂: "音樂",
  historical: "歷史", 历史: "歷史", 歷史: "歷史",
  mecha: "機器人", 機器人: "機器人", 机器人: "機器人",
  isekai: "異世界", 异世界: "異世界", 異世界: "異世界",
  healing: "療癒", 治癒: "療癒", 治愈: "療癒", 療癒: "療癒",
  family: "家庭", 家庭: "家庭",
  workplace: "職場", 职场: "職場", 職場: "職場",
  food: "美食", 美食: "美食",
  military: "軍事", 军事: "軍事", 軍事: "軍事",
  crime: "犯罪", 犯罪: "犯罪",
  "girls love": "百合", yuri: "百合", 百合: "百合",
  "boys love": "BL", "boy's love": "BL", bl: "BL",
}));

const BROAD_MEDIA_GENRES = new Set([
  "戀愛",
  "喜劇",
  "奇幻",
  "冒險",
  "動作",
  "劇情",
  "日常",
  "心理",
  "懸疑",
  "驚悚",
  "恐怖",
  "科幻",
  "超自然",
  "運動",
  "音樂",
  "歷史",
  "機器人",
]);

export function normalizeGenre(value: unknown): string {
  const raw = typeof value === "string"
    ? value
    : typeof value === "object" && value !== null && "name" in value
      ? stringValue((value as { name?: unknown }).name)
      : "";
  const clean = raw.normalize("NFKC").trim().replace(/^#/, "");
  if (!clean) return "";
  const key = clean.toLocaleLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  return GENRE_ALIASES.get(key) || clean;
}

export function normalizeGenres(values: unknown, limit = 12): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of asArray(values)) {
    const value = normalizeGenre(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * Provider tag lists such as Bangumi `subject.tags` and Open Library
 * `subject` mix genres with staff, dates, formats, adaptation notes, and
 * arbitrary user tags. Only retain broad genre values when those loose tag
 * lists are used as a fallback source. AniList's explicit `genres` field
 * continues to use `normalizeGenres()` directly.
 */
export function normalizeBroadGenres(values: unknown, limit = 12): string[] {
  return normalizeGenres(values, Number.MAX_SAFE_INTEGER)
    .filter((value) => BROAD_MEDIA_GENRES.has(value))
    .slice(0, limit);
}

const PRODUCTION_COMMITTEE_PATTERN = /(製作委員会|制作委員会|製作委員會|制作委員會|製作委员会|制作委员会)/i;
const NON_STUDIO_ORGANIZATION_PATTERN = /(パートナーズ|\bpartners?\b|copyright)/i;
const STUDIO_SEPARATOR_PATTERN = /[、,，;；\n]+/;

function studioText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "name" in value) {
    return stringValue((value as { name?: unknown }).name);
  }
  return "";
}

/**
 * Normalize animation-company metadata without treating production committees
 * or their producer/staff tails as studios. Bangumi occasionally exposes a
 * value shaped like `CloverWorks、「作品」製作委員会（...）producer names...`;
 * only the company prefix is useful to AnimeList.
 */
export function normalizeAnimeStudios(values: unknown, limit = 1): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const raw of asArray(values)) {
    let value = studioText(raw).normalize("NFKC").trim();
    if (!value) continue;

    const committeeIndex = value.search(PRODUCTION_COMMITTEE_PATTERN);
    if (committeeIndex >= 0) {
      const prefix = value.slice(0, committeeIndex);
      const separatorIndex = Math.max(
        prefix.lastIndexOf("、"),
        prefix.lastIndexOf(","),
        prefix.lastIndexOf("，"),
        prefix.lastIndexOf(";"),
        prefix.lastIndexOf("；"),
        prefix.lastIndexOf("/"),
      );
      value = separatorIndex >= 0 ? prefix.slice(0, separatorIndex) : "";
    }

    for (const part of value.split(STUDIO_SEPARATOR_PATTERN)) {
      const studio = part
        .replace(/^(?:動畫製作|动画制作|動畫制作|动画製作|製作会社|制作会社|製作公司|制作公司)\s*[:：]\s*/i, "")
        .trim();
      if (
        !studio
        || PRODUCTION_COMMITTEE_PATTERN.test(studio)
        || NON_STUDIO_ORGANIZATION_PATTERN.test(studio)
        || seen.has(studio)
      ) continue;
      seen.add(studio);
      output.push(studio);
      if (output.length >= limit) return output;
    }
  }

  return output;
}

/**
 * Return true only when stored studio metadata is already a single clean
 * primary-company value. Multi-company or legacy producer/committee shapes
 * should be refreshed from AniList when Edit Media opens.
 */
export function hasCanonicalPrimaryAnimeStudio(values: unknown): boolean {
  const raw = asArray(values)
    .map((value) => studioText(value).normalize("NFKC").trim())
    .filter(Boolean);
  if (raw.length !== 1) return false;
  const normalized = normalizeAnimeStudios(raw, 1);
  return normalized.length === 1 && normalized[0] === raw[0];
}

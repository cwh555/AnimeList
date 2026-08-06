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
const NON_STUDIO_COMPANY_PATTERN = /(パートナーズ|partners|製作会社|制作会社|製作公司|制作公司|製作$|制作$)/i;
const STUDIO_SEPARATOR_PATTERN = /[、,，;；\n/]+/;

const CANONICAL_STUDIO_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:スタジオ\s*コロリド|studio\s*colorido)/i, "Studio Colorido"],
  [/(?:スタジオ\s*クロマト|studio\s*chromato)/i, "Studio Chromato"],
  [/(?:シンエイ動画|shin[\s-]*ei\s*animation)/i, "Shin-Ei Animation"],
];

function studioText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "name" in value) {
    return stringValue((value as { name?: unknown }).name);
  }
  return "";
}

function canonicalStudioAliases(value: string): string[] {
  return CANONICAL_STUDIO_ALIASES
    .filter(([pattern]) => pattern.test(value))
    .map(([, canonical]) => canonical);
}

function normalizeStudioPart(value: string): string {
  const clean = value
    .replace(/^(?:動畫製作|动画制作|動畫制作|动画製作|製作会社|制作会社|製作公司|制作公司)\s*[:：]\s*/i, "")
    .replace(/^[\s()（）[\]【】]+|[\s()（）[\]【】]+$/g, "")
    .trim();
  if (!clean || PRODUCTION_COMMITTEE_PATTERN.test(clean) || NON_STUDIO_COMPANY_PATTERN.test(clean)) return "";
  const aliases = canonicalStudioAliases(clean);
  return aliases[0] ?? clean;
}

/**
 * Return one stable, user-facing primary animation studio.
 *
 * AniList already orders `studios(isMain: true)` by the provider's primary
 * studio order, so retaining the first normalized entry gives notes, filters,
 * and Edit Media one consistent company identity. Bangumi occasionally folds
 * a production committee, aliases, and multiple studios into one infobox
 * string; known aliases are extracted before generic splitting so that a value
 * such as `コロリド・ツインエンジンパートナーズ (...) スタジオコロリド・STUDIO CHROMATO`
 * resolves to the common name `Studio Colorido` instead of the committee.
 */
export function normalizeAnimeStudios(values: unknown, limit = 1): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const append = (studio: string): boolean => {
    const key = studio.toLocaleLowerCase();
    if (!studio || seen.has(key)) return false;
    seen.add(key);
    output.push(studio);
    return output.length >= Math.max(1, limit);
  };

  for (const raw of asArray(values)) {
    let value = studioText(raw).normalize("NFKC").trim();
    if (!value) continue;

    const aliases = canonicalStudioAliases(value);
    if (aliases.length) {
      for (const studio of aliases) if (append(studio)) return output;
      continue;
    }

    const committeeIndex = value.search(PRODUCTION_COMMITTEE_PATTERN);
    if (committeeIndex >= 0) value = value.slice(0, committeeIndex);

    for (const part of value.split(STUDIO_SEPARATOR_PATTERN)) {
      const studio = normalizeStudioPart(part);
      if (studio && append(studio)) return output;
    }
  }

  return output;
}

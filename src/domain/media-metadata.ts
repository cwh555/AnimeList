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

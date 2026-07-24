export type ClassificationKind = "genre" | "tag";
export type AniListClassificationSource = "genre" | "tag";

export interface ClassificationCatalogEntry {
  id: string;
  anilistName: string;
  label: string;
  kind: ClassificationKind;
  source: AniListClassificationSource;
  aliases?: readonly string[];
}

type CatalogRow = readonly [string, string, string, (readonly string[])?];

const OFFICIAL_GENRES = [
  ["action", "Action", "動作", ["动作"]],
  ["adventure", "Adventure", "冒險", ["冒险"]],
  ["comedy", "Comedy", "喜劇", ["喜剧"]],
  ["drama", "Drama", "劇情", ["剧情"]],
  ["ecchi", "Ecchi", "情色"],
  ["fantasy", "Fantasy", "奇幻"],
  ["horror", "Horror", "恐怖"],
  ["mahou-shoujo", "Mahou Shoujo", "魔法少女"],
  ["mecha", "Mecha", "機器人", ["机器人"]],
  ["music", "Music", "音樂", ["音乐"]],
  ["mystery", "Mystery", "懸疑", ["悬疑"]],
  ["psychological", "Psychological", "心理"],
  ["romance", "Romance", "戀愛", ["恋爱"]],
  ["sci-fi", "Sci-Fi", "科幻", ["Science Fiction"]],
  ["slice-of-life", "Slice of Life", "日常", ["Slice-of-Life"]],
  ["sports", "Sports", "運動", ["运动"]],
  ["supernatural", "Supernatural", "超自然"],
  ["thriller", "Thriller", "驚悚", ["惊悚"]],
] as const satisfies readonly CatalogRow[];

// Broad setting/theme tags are promoted into the user-facing classification field.
const PROMOTED_CLASSIFICATION_TAGS = [
  ["school", "School", "校園", ["校ߛ�", "School Life"]],
  ["isekai", "Isekai", "異世界", ["异世界"]],
  ["magic", "Magic", "魔法"],
  ["martial-arts", "Martial Arts", "武術", ["武术"]],
  ["military", "Military", "軍事", ["军事"]],
  ["food", "Food", "美食"],
  ["family-life", "Family Life", "家庭生活"],
  ["iyashikei", "Iyashikei", "療癒", ["治癒", "治愈"]],
  ["cultivation", "Cultivation", "修仙"],
  ["dungeon", "Dungeon", "迷宮", ["迷宫"]],
  ["reincarnation", "Reincarnation", "轉生", ["转生"]],
  ["urban-fantasy", "Urban Fantasy", "都市奇幻"],
  ["video-games", "Video Games", "電子遊戲", ["电子游戏"]],
  ["virtual-world", "Virtual World", "虛擬世界", ["虚拟世界"]],
  ["work", "Work", "職場", ["职场", "Workplace"]],
  ["time-loop", "Time Loop", "時間循環", ["时间循环"]],
  ["time-manipulation", "Time Manipulation", "時間操控", ["时间操控"]],
  ["time-skip", "Time Skip", "時間跳躍", ["时间跳跃"]],
  ["time-travel", "Time Travel", "時間旅行", ["时间旅行"]],
  ["super-power", "Super Power", "超能力"],
] as const satisfies readonly CatalogRow[];

// Only reviewed descriptive tags are auto-attached. Demographic, sexual-orientation,
// protagonist-gender, cast-age, adaptation-source, staff and studio labels are excluded.
const DESCRIPTIVE_TAGS = [
  ["slapstick", "Slapstick", "鬧劇"],
  ["ensemble-cast", "Ensemble Cast", "群像"],
  ["episodic", "Episodic", "單元劇"],
  ["coming-of-age", "Coming of Age", "成長", ["成长"]],
  ["anti-hero", "Anti-Hero", "反英雄"],
  ["bullying", "Bullying", "霸凌"],
  ["revenge", "Revenge", "復仇"],
  ["survival", "Survival", "生存"],
  ["gender-bending", "Gender Bending", "性別轉換", ["性别转换"]],
  ["age-regression", "Age Regression", "年齡回歸", ["年龄回归"]],
  ["aliens", "Aliens", "外星人"],
] as const satisfies readonly CatalogRow[];

function entries(
  kind: ClassificationKind,
  source: AniListClassificationSource,
  rows: readonly CatalogRow[],
): readonly ClassificationCatalogEntry[] {
  return rows.map(([id, anilistName, label, aliases]) => ({
    id: `${kind}:${id}`,
    anilistName,
    label,
    aliases,
    kind,
    source,
  }));
}

export const OFFICIAL_GENRE_CATALOG = entries("genre", "genre", OFFICIAL_GENRES);
export const PROMOTED_TAG_CATALOG = entries("genre", "tag", PROMOTED_CLASSIFICATION_TAGS);
export const DESCRIPTIVE_TAG_CATALOG = entries("tag", "tag", DESCRIPTIVE_TAGS);

export const BUILTIN_GENRES = [...OFFICIAL_GENRE_CATALOG, ...PROMOTED_TAG_CATALOG] as const;
export const BUILTIN_TAGS = DESCRIPTIVE_TAG_CATALOG;
export const ALL_CLASSIFICATIONS = [...BUILTIN_GENRES, ...BUILTIN_TAGS] as const;

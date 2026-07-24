export type ClassificationKind = "genre" | "tag";
export type AniListClassificationSource = "genre" | "tag";

export interface ClassificationCatalogEntry {
  id: string;
  anilistName: string;
  label: string;
  kind: ClassificationKind;
  source: AniListClassificationSource;
  minimumRank?: number;
  aliases?: readonly string[];
}

type GenreRow = readonly [string, string, string, (readonly string[])?];
type PromotedTagRow = readonly [string, string, string, number, (readonly string[])?];

// Broad work categories aligned with the level used by seasonal anime guides such as
// ACG Secrets' "按作品分類" filter. These are intentionally not plot-detail tags.
const OFFICIAL_GENRES = [
  ["action", "Action", "動作", ["动作"]],
  ["adventure", "Adventure", "冒險", ["冒险"]],
  ["comedy", "Comedy", "喜劇", ["喜剧"]],
  ["drama", "Drama", "劇情", ["剧情", "戲劇"]],
  ["ecchi", "Ecchi", "家長指引", ["情色"]],
  ["fantasy", "Fantasy", "奇幻"],
  ["horror", "Horror", "恐怖"],
  ["mahou-shoujo", "Mahou Shoujo", "魔法少女"],
  ["mecha", "Mecha", "機器人", ["机器人"]],
  ["music", "Music", "音樂", ["音乐"]],
  ["mystery", "Mystery", "懸疑", ["悬疑", "神秘"]],
  ["psychological", "Psychological", "心理"],
  ["romance", "Romance", "戀愛", ["恋爱", "浪漫"]],
  ["sci-fi", "Sci-Fi", "科幻", ["Science Fiction"]],
  ["slice-of-life", "Slice of Life", "日常", ["Slice-of-Life"]],
  ["sports", "Sports", "運動", ["运动"]],
  ["supernatural", "Supernatural", "超自然"],
  ["thriller", "Thriller", "驚悚", ["惊悚"]],
] as const satisfies readonly GenreRow[];

// AniList represents several broad categories as MediaTag rather than Media.genres.
// Only these high-level categories are promoted, and only when the per-work rank is
// strong enough. Subgenres and plot details such as Dungeon, Food, Revenge, Work,
// Time Skip, and character/demographic tags are deliberately excluded.
const PROMOTED_CLASSIFICATION_TAGS = [
  ["school", "School", "校園", 70, ["校园", "School Life"]],
  ["historical", "Historical", "歷史", 70, ["历史"]],
  ["magic", "Magic", "魔法", 70],
  ["military", "Military", "軍事", 70, ["军事"]],
  ["super-power", "Super Power", "超能力", 70],
  ["harem", "Harem", "後宮", 70, ["后宫"]],
  ["female-harem", "Female Harem", "後宮", 70, ["后宫"]],
  ["martial-arts", "Martial Arts", "武術", 70, ["武术", "武俠", "武侠"]],
  ["samurai", "Samurai", "武士", 70],
  ["demons", "Demons", "惡魔", 70, ["恶魔"]],
] as const satisfies readonly PromotedTagRow[];

function genreEntries(rows: readonly GenreRow[]): readonly ClassificationCatalogEntry[] {
  return rows.map(([id, anilistName, label, aliases]) => ({
    id: `genre:${id}`,
    anilistName,
    label,
    aliases,
    kind: "genre",
    source: "genre",
  }));
}

function promotedTagEntries(rows: readonly PromotedTagRow[]): readonly ClassificationCatalogEntry[] {
  return rows.map(([id, anilistName, label, minimumRank, aliases]) => ({
    id: `genre:${id}`,
    anilistName,
    label,
    minimumRank,
    aliases,
    kind: "genre",
    source: "tag",
  }));
}

export const OFFICIAL_GENRE_CATALOG = genreEntries(OFFICIAL_GENRES);
export const PROMOTED_TAG_CATALOG = promotedTagEntries(PROMOTED_CLASSIFICATION_TAGS);

// Automatic media tags are intentionally disabled. The field remains available for
// user-authored tags, but provider detail tags are not imported automatically.
export const DESCRIPTIVE_TAG_CATALOG = [] as const satisfies readonly ClassificationCatalogEntry[];

export const BUILTIN_GENRES = [...OFFICIAL_GENRE_CATALOG, ...PROMOTED_TAG_CATALOG] as const;
export const BUILTIN_TAGS = DESCRIPTIVE_TAG_CATALOG;
export const ALL_CLASSIFICATIONS = [...BUILTIN_GENRES, ...BUILTIN_TAGS] as const;

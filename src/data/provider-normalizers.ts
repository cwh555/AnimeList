import { normalizeGenres } from "../domain/media-metadata";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { asArray, numeric, stringValue } from "../domain/value-normalization";
import { uiText } from "../ui-text";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearValue(value: unknown): number | string {
  const parsed = optionalNumber(value);
  return parsed ?? "";
}

function stringList(value: unknown): string[] {
  return asArray(value).map((entry) => stringValue(entry).trim()).filter(Boolean);
}

function stripHtml(value: unknown): string {
  return stringValue(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normalizeComparable(value: unknown): string {
  return stringValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function mapFormat(value: unknown, mediaType: MediaType): string {
  const format = stringValue(value).toUpperCase();
  const formats: Readonly<Record<string, string>> = {
    TV: "tv",
    TV_SHORT: "tv",
    MOVIE: "movie",
    OVA: "ova",
    ONA: "ona",
    SPECIAL: "special",
    MUSIC: "music",
    MANGA: "manga",
    ONE_SHOT: "one_shot",
    NOVEL: "light_novel",
  };
  return formats[format] ?? (mediaType === "anime" ? "tv" : mediaType === "manga" ? "manga" : "novel");
}

function bangumiInfoboxValues(infobox: unknown, keys: readonly string[]): string[] {
  const wanted = new Set(keys.map((key) => key.toLocaleLowerCase()));
  const values: string[] = [];
  for (const rawRow of asArray(infobox)) {
    const row = record(rawRow);
    if (!wanted.has(stringValue(row.key).toLocaleLowerCase())) continue;
    const rawValue = row.value;
    if (Array.isArray(rawValue)) {
      for (const rawEntry of rawValue) {
        const entry = record(rawEntry);
        values.push(typeof rawEntry === "string" ? rawEntry : stringValue(entry.v, stringValue(entry.k)));
      }
    } else if (typeof rawValue === "object" && rawValue !== null) {
      const entry = record(rawValue);
      values.push(stringValue(entry.v, stringValue(entry.k)));
    } else {
      values.push(stringValue(rawValue));
    }
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeBangumiSubject(value: unknown, mediaType: MediaType): ExternalMediaResult {
  const subject = record(value);
  const originalTitle = stringValue(subject.name).trim();
  const localTitle = stringValue(subject.name_cn, originalTitle || uiText("media.untitled")).trim();
  const images = record(subject.images);
  const people = mediaType === "anime"
    ? bangumiInfoboxValues(subject.infobox, ["动画制作", "動畫製作", "制作", "製作"])
    : bangumiInfoboxValues(subject.infobox, ["作者", "原作", "作画", "作畫"]);
  const platform = stringValue(subject.platform).trim();
  let format = mediaType === "anime" ? "tv" : mediaType === "manga" ? "manga" : "light_novel";
  if (/剧场|劇場|movie/i.test(platform)) format = "movie";
  else if (/ova/i.test(platform)) format = "ova";
  else if (/web|ona/i.test(platform)) format = "ona";
  const date = stringValue(subject.date);
  const rawGenres = asArray(subject.tags)
    .slice(0, 16)
    .map((tag) => typeof tag === "string" ? tag : stringValue(record(tag).name))
    .filter(Boolean);
  const subjectId = stringValue(subject.id);
  const rating = record(subject.rating);
  return {
    provider: "bangumi",
    sourceId: subjectId,
    sourceUrl: subjectId ? `https://bgm.tv/subject/${subjectId}` : "",
    mediaType,
    title: localTitle,
    originalTitle,
    romajiTitle: "",
    format,
    year: yearValue(date.slice(0, 4)),
    coverUrl: stringValue(images.large, stringValue(images.common, stringValue(images.medium, stringValue(images.small, stringValue(images.grid))))),
    genres: normalizeGenres(rawGenres),
    rawGenres,
    people,
    platforms: platform ? [platform] : [],
    total: mediaType === "anime" ? numeric(subject.eps ?? subject.total_episodes) : 0,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: stringValue(subject.summary).trim(),
    externalScore: optionalNumber(rating.score),
    releaseStatus: "unknown",
    searchTitles: [...new Set([
      localTitle,
      originalTitle,
      ...bangumiInfoboxValues(subject.infobox, ["别名", "別名", "中文名", "简体中文名", "簡體中文名", "繁体中文名", "繁體中文名"]),
    ].map((title) => title.trim()).filter(Boolean))],
  };
}

export function normalizeAniListMedia(value: unknown, mediaType: MediaType): ExternalMediaResult {
  const media = record(value);
  const title = record(media.title);
  const localTitle = stringValue(title.english, stringValue(title.romaji, stringValue(title.native, uiText("media.untitled")))).trim();
  const originalTitle = stringValue(title.native, stringValue(title.romaji)).trim();
  const staff = asArray(record(media.staff).edges)
    .map((rawEdge) => record(rawEdge))
    .filter((edge) => /creator|story|art|author|original/i.test(stringValue(edge.role)))
    .map((edge) => {
      const name = record(record(edge.node).name);
      return stringValue(name.native, stringValue(name.full));
    })
    .filter(Boolean);
  const studios = asArray(record(media.studios).nodes)
    .map((node) => stringValue(record(node).name))
    .filter(Boolean);
  const statusMap: Readonly<Record<string, ExternalMediaResult["releaseStatus"]>> = {
    RELEASING: "releasing",
    FINISHED: "finished",
    HIATUS: "hiatus",
    CANCELLED: "cancelled",
  };
  const rawGenres = stringList(media.genres).slice(0, 12);
  const mediaId = stringValue(media.id);
  const siteUrl = stringValue(media.siteUrl, mediaId
    ? `https://anilist.co/${mediaType === "anime" ? "anime" : "manga"}/${mediaId}`
    : "");
  const cover = record(media.coverImage);
  const averageScore = optionalNumber(media.averageScore);
  return {
    provider: "anilist",
    sourceId: mediaId,
    sourceUrl: siteUrl,
    mediaType,
    title: localTitle,
    originalTitle,
    romajiTitle: stringValue(title.romaji),
    format: mapFormat(media.format, mediaType),
    year: yearValue(record(media.startDate).year),
    coverUrl: stringValue(cover.extraLarge, stringValue(cover.large, stringValue(cover.medium))),
    genres: normalizeGenres(rawGenres),
    rawGenres,
    people: mediaType === "anime" ? studios : staff,
    platforms: [],
    total: mediaType === "anime" ? numeric(media.episodes) : 0,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: stripHtml(media.description),
    externalScore: averageScore === null ? null : averageScore / 10,
    releaseStatus: statusMap[stringValue(media.status).toUpperCase()] ?? "unknown",
    searchTitles: [...new Set([
      localTitle,
      originalTitle,
      stringValue(title.romaji),
      stringValue(title.english),
      stringValue(title.native),
      ...stringList(media.synonyms),
    ].map((entry) => entry.trim()).filter(Boolean))],
  };
}

export function normalizeOpenLibraryBook(value: unknown): ExternalMediaResult {
  const book = record(value);
  const key = stringValue(book.key).replace(/^\/works\//, "");
  const rawGenres = stringList(book.subject).slice(0, 16);
  const title = stringValue(book.title, uiText("media.untitled"));
  const coverId = stringValue(book.cover_i);
  return {
    provider: "openlibrary",
    sourceId: key,
    sourceUrl: key ? `https://openlibrary.org/works/${key}` : "",
    mediaType: "novel",
    title,
    originalTitle: stringValue(book.title),
    romajiTitle: "",
    format: "novel",
    year: yearValue(book.first_publish_year),
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : "",
    genres: normalizeGenres(rawGenres),
    rawGenres,
    people: stringList(book.author_name).slice(0, 6),
    platforms: [],
    total: 0,
    unit: "volume",
    summary: "",
    externalScore: null,
    releaseStatus: "unknown",
  };
}

export function dedupeSearchResults(results: readonly ExternalMediaResult[]): ExternalMediaResult[] {
  const seenSource = new Set<string>();
  const titleOwners = new Map<string, string>();
  const output: ExternalMediaResult[] = [];
  for (const result of results) {
    const sourceKey = `${result.provider}:${result.sourceId}`;
    if (seenSource.has(sourceKey)) continue;
    seenSource.add(sourceKey);

    const comparableTitle = normalizeComparable(result.title || result.originalTitle);
    const titleKey = comparableTitle
      ? `${result.mediaType}:${comparableTitle}:${result.year || ""}:${result.format || ""}`
      : "";
    const titleOwner = titleKey ? titleOwners.get(titleKey) : undefined;
    if (titleOwner && titleOwner !== result.provider) continue;
    if (titleKey && !titleOwner) titleOwners.set(titleKey, result.provider);
    output.push(result);
  }
  return output;
}

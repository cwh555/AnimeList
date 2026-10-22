import { deduplicateMediaIdentities } from "../domain/search/entity-resolution";
import { normalizeAniListClassification } from "../domain/media-classification";
import { normalizeAnimeStudios, normalizeBroadGenres, normalizeGenres, normalizeStructuredAnimationStudios } from "../domain/media-metadata";
import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import { asArray, numeric, stringValue } from "../domain/value-normalization";
import { uiText } from "../ui-text";
import { localizeActiveMediaResult } from "./media-title-service";

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

function dateParts(value: unknown): { year: number | null; month: number | null; day: number | null } | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    const year = Number(input.year);
    const month = Number(input.month);
    const day = Number(input.day);
    return {
      year: Number.isInteger(year) && year > 0 ? year : null,
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
      day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
    };
  }
  const text = stringValue(value).trim();
  const match = text.match(/^((?:19|20)\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return {
    year: Number.isInteger(year) ? year : null,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
  };
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

const BANGUMI_ANIMATION_STUDIO_FIELDS = [
  "动画制作",
  "動畫製作",
  "动画制作公司",
  "動畫製作公司",
  "アニメーション制作",
  "アニメーション製作",
] as const;

const BANGUMI_ANIMATION_STUDIO_RELATIONS = new Set([
  "动画制作",
  "動畫製作",
  "アニメーション制作",
  "アニメーション製作",
].map((value) => normalizeComparable(value)));

/**
 * Extract animation studios from Bangumi's structured subject-person relation
 * endpoint. Relation/type are provider-owned semantics; company names are never
 * classified by keywords here. Bangumi person types 2 and 3 are company/group.
 */
export function normalizeBangumiAnimationStudiosFromPersons(value: unknown): string[] {
  return normalizeAnimeStudios(
    asArray(value)
      .map((entry) => record(entry))
      .filter((entry) => BANGUMI_ANIMATION_STUDIO_RELATIONS.has(normalizeComparable(entry.relation)))
      .filter((entry) => entry.type === 2 || entry.type === 3)
      .map((entry) => stringValue(entry.name).trim())
      .filter(Boolean),
  );
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
  const simplifiedTitle = stringValue(subject.name_cn).trim();
  const traditionalTitle = bangumiInfoboxValues(subject.infobox, ["繁體中文名", "繁体中文名"])[0] ?? "";
  const providerFallback = simplifiedTitle || originalTitle || uiText("media.untitled");
  const images = record(subject.images);
  const people = mediaType === "anime"
    ? normalizeAnimeStudios(bangumiInfoboxValues(subject.infobox, BANGUMI_ANIMATION_STUDIO_FIELDS))
    : bangumiInfoboxValues(subject.infobox, ["作者", "原作", "作画", "作畫"]);
  const platform = stringValue(subject.platform).trim();
  let format = mediaType === "anime" ? "tv" : mediaType === "manga" ? "manga" : "light_novel";
  if (/剧场|劇場|movie/i.test(platform)) format = "movie";
  else if (/ova/i.test(platform)) format = "ova";
  else if (/web|ona/i.test(platform)) format = "ona";
  const date = stringValue(subject.date);
  const providerTags = asArray(subject.tags)
    .slice(0, 16)
    .map((tag) => typeof tag === "string" ? tag : stringValue(record(tag).name))
    .filter(Boolean);
  const genres = normalizeBroadGenres(providerTags);
  const subjectId = stringValue(subject.id);
  const rating = record(subject.rating);
  return localizeActiveMediaResult({
    provider: "bangumi",
    sourceId: subjectId,
    sourceUrl: subjectId ? `https://bgm.tv/subject/${subjectId}` : "",
    mediaType,
    title: providerFallback,
    originalTitle,
    romajiTitle: "",
    titleVariants: {
      fallback: providerFallback,
      original: originalTitle,
      localized: {
        ...(simplifiedTitle ? { "zh-CN": simplifiedTitle } : {}),
        ...(traditionalTitle ? { "zh-TW": traditionalTitle } : {}),
        ...(bangumiInfoboxValues(subject.infobox, ["日文名", "日本語名"])[0]
          ? { ja: bangumiInfoboxValues(subject.infobox, ["日文名", "日本語名"])[0] } : {}),
      },
    },
    format,
    year: yearValue(date.slice(0, 4)),
    startDate: dateParts(date),
    coverUrl: stringValue(images.large, stringValue(images.common, stringValue(images.medium, stringValue(images.small, stringValue(images.grid))))),
    genres,
    rawGenres: genres,
    people,
    platforms: platform ? [platform] : [],
    total: mediaType === "anime" ? numeric(subject.eps ?? subject.total_episodes) : 0,
    unit: mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume",
    summary: stringValue(subject.summary).trim(),
    externalScore: optionalNumber(rating.score),
    releaseStatus: "unknown",
    searchTitles: [...new Set([
      providerFallback,
      originalTitle,
      simplifiedTitle,
      traditionalTitle,
      ...bangumiInfoboxValues(subject.infobox, ["别名", "別名", "中文名", "简体中文名", "簡體中文名", "繁体中文名", "繁體中文名"]),
    ].map((title) => title.trim()).filter(Boolean))],
    sources: subjectId ? [{ provider: "bangumi", sourceId: subjectId, sourceUrl: `https://bgm.tv/subject/${subjectId}` }] : [],
  });
}

export function normalizeAniListMedia(value: unknown, mediaType: MediaType): ExternalMediaResult {
  const media = record(value);
  const title = record(media.title);
  const englishTitle = stringValue(title.english).trim();
  const romajiTitle = stringValue(title.romaji).trim();
  const originalTitle = stringValue(title.native, romajiTitle).trim();
  const country = stringValue(media.countryOfOrigin).toUpperCase();
  const providerFallback = englishTitle || romajiTitle || originalTitle || uiText("media.untitled");
  const staff = asArray(record(media.staff).edges)
    .map((rawEdge) => record(rawEdge))
    .filter((edge) => /creator|story|art|author|original/i.test(stringValue(edge.role)))
    .map((edge) => {
      const name = record(record(edge.node).name);
      return stringValue(name.native, stringValue(name.full));
    })
    .filter(Boolean);
  const studios = normalizeStructuredAnimationStudios(asArray(record(media.studios).nodes));
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
  const classification = normalizeAniListClassification(media);
  return localizeActiveMediaResult({
    provider: "anilist",
    sourceId: mediaId,
    sourceUrl: siteUrl,
    mediaType,
    title: providerFallback,
    originalTitle,
    romajiTitle: stringValue(title.romaji),
    titleVariants: {
      fallback: providerFallback,
      original: originalTitle,
      romaji: romajiTitle,
      localized: {
        ...(englishTitle ? { en: englishTitle } : {}),
        ...(country === "JP" && originalTitle ? { ja: originalTitle } : {}),
        ...(country === "KR" && originalTitle ? { ko: originalTitle } : {}),
        ...(country === "CN" && originalTitle ? { "zh-CN": originalTitle } : {}),
        ...((country === "TW" || country === "HK") && originalTitle ? { "zh-TW": originalTitle } : {}),
      },
    },
    format: mapFormat(media.format, mediaType),
    year: yearValue(record(media.startDate).year),
    startDate: dateParts(media.startDate),
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
      providerFallback,
      originalTitle,
      stringValue(title.romaji),
      stringValue(title.english),
      stringValue(title.native),
      ...stringList(media.synonyms),
    ].map((entry) => entry.trim()).filter(Boolean))],
    sources: mediaId ? [{ provider: "anilist", sourceId: mediaId, sourceUrl: siteUrl }] : [],
    ...(classification ? { classification } : {}),
  });
}

export function normalizeOpenLibraryBook(value: unknown): ExternalMediaResult {
  const book = record(value);
  const key = stringValue(book.key).replace(/^\/works\//, "");
  const providerSubjects = stringList(book.subject).slice(0, 16);
  const genres = normalizeBroadGenres(providerSubjects);
  const title = stringValue(book.title, uiText("media.untitled"));
  const coverId = stringValue(book.cover_i);
  return localizeActiveMediaResult({
    provider: "openlibrary",
    sourceId: key,
    sourceUrl: key ? `https://openlibrary.org/works/${key}` : "",
    mediaType: "novel",
    title,
    originalTitle: stringValue(book.title),
    romajiTitle: "",
    titleVariants: { fallback: title, original: stringValue(book.title) },
    format: "novel",
    year: yearValue(book.first_publish_year),
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : "",
    genres,
    rawGenres: genres,
    people: stringList(book.author_name).slice(0, 6),
    platforms: [],
    total: 0,
    unit: "volume",
    summary: "",
    externalScore: null,
    releaseStatus: "unknown",
    sources: key ? [{ provider: "openlibrary", sourceId: key, sourceUrl: `https://openlibrary.org/works/${key}` }] : [],
  });
}

export function dedupeSearchResults(results: readonly ExternalMediaResult[]): ExternalMediaResult[] {
  return deduplicateMediaIdentities(results);
}

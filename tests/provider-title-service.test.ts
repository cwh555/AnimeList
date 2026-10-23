import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withActiveLocale } from "../src/i18n/catalog";
import { selectNewMediaTitle, chineseScriptCandidate } from "../src/domain/media-title-localization";
import { localizeExternalMediaResult } from "../src/data/media-title-service";
import { normalizeAniListMedia, normalizeBangumiSubject, normalizeOpenLibraryBook } from "../src/data/provider-normalizers";
import { openLibrarySearchLanguage } from "../src/data/providers/open-library-client";
import { buildMediaMarkdown } from "../src/data/media-note-codec";
import type { ExternalMediaResult, MediaNoteForm } from "../src/domain/media-types";

function note(result: ExternalMediaResult, title = result.title): string {
  const form: MediaNoteForm = {
    title, status: "planned", releaseStatus: "unknown", progress: 0,
    total: result.total, unit: result.unit, score: null, favorite: false,
    startedAt: "", completedAt: "", genres: [], templatePath: "", volumeLog: [],
  };
  return buildMediaMarkdown(result, form, "", "");
}

describe("cross-provider title localization contract", () => {
  it("applies a shared locale rule to Bangumi anime, manga and novels", () => {
    const raw = {
      id: 77, name: "日本語原題", name_cn: "简体标题",
      infobox: [{ key: "作者", value: "著者氏名" }],
    };
    for (const type of ["anime", "manga", "novel"] as const) {
      const traditional = withActiveLocale("zh-TW", () => normalizeBangumiSubject(raw, type));
      const simplified = withActiveLocale("zh-CN", () => normalizeBangumiSubject(raw, type));
      assert.equal(traditional.title, "簡體標題");
      assert.equal(simplified.title, "简体标题");
      assert.equal(traditional.titleVariants?.localized?.["zh-TW"], undefined);
      assert.equal(traditional.titleVariants?.localized?.["zh-CN"], "简体标题");
      assert.deepEqual(traditional.titleScriptConversions, { "zh-TW": "簡體標題" });
      const markdown = note(traditional);
      assert.match(markdown, /title_script_conversions:\n  zh-TW: "簡體標題"/);
      assert.match(markdown, /title_original: "日本語原題"/);
    }
  });

  it("displays a Bangumi Korean work's own Chinese infobox alias without claiming official localization", () => {
    const raw = {
      id: 399671,
      name: "수요웹툰의 나강림",
      name_cn: "",
      infobox: [{
        key: "别名",
        value: [
          { k: "", v: "漫画里的罗康林" },
          { k: "日版", v: "水曜マンガに俺降臨" },
          { k: "非官方1", v: "Webtoon Character Na Kang Lim" },
        ],
      }],
    };
    const chinese = withActiveLocale("zh-TW", () => normalizeBangumiSubject(raw, "manga"));
    assert.equal(chinese.title, "漫畫裡的羅康林");
    assert.equal(chinese.originalTitle, "수요웹툰의 나강림");
    assert.equal(chinese.titleVariants?.displayAliases?.["zh-CN"], "漫画里的罗康林");
    assert.equal(chinese.titleVariants?.localized?.["zh-TW"], undefined);
    assert.deepEqual(chinese.titleScriptConversions, { "zh-TW": "漫畫裡的羅康林" });
    assert.ok(chinese.searchTitles?.includes("漫画里的罗康林"));
    assert.ok(chinese.searchTitles?.includes("수요웹툰의 나강림"));
    const korean = localizeExternalMediaResult(chinese, "ko");
    assert.equal(korean.title, "수요웹툰의 나강림");
    const markdown = note(chinese);
    assert.match(markdown, /title: "漫畫裡的羅康林"/);
    assert.doesNotMatch(markdown, /title_localizations:.*漫畫裡的羅康林/);
  });

  it("selects only provenance-labeled AniList English, Japanese and Korean titles", () => {
    const japanese = {
      id: 10, countryOfOrigin: "JP", title: {
        native: "日本語原題", romaji: "Nihongo Gendai", english: "Official English",
      },
      synonyms: ["中文未標記別名"], staff: { edges: [] },
    };
    const korean = { ...japanese, id: 11, countryOfOrigin: "KR", title: {
      native: "한국어 원제", romaji: "Hangukeo Wonje", english: "Official English",
    } };
    assert.equal(withActiveLocale("ja", () => normalizeAniListMedia(japanese, "anime")).title, "日本語原題");
    assert.equal(withActiveLocale("ko", () => normalizeAniListMedia(korean, "anime")).title, "한국어 원제");
    assert.equal(withActiveLocale("en", () => normalizeAniListMedia(japanese, "anime")).title, "Official English");
    const chinese = withActiveLocale("zh-TW", () => normalizeAniListMedia(japanese, "anime"));
    assert.equal(chinese.title, "Official English");
    assert.equal(chinese.titleVariants?.localized?.["zh-TW"], undefined);
    assert.equal(chinese.titleVariants?.localized?.["zh-CN"], undefined);
    assert.equal(chinese.titleScriptConversions, undefined);
    assert.ok(chinese.searchTitles?.includes("中文未標記別名"));
    assert.ok(chinese.searchTitles?.includes("日本語原題"));
    const koreanOnJapaneseInterface = withActiveLocale("ja", () => normalizeAniListMedia(korean, "anime"));
    assert.equal(koreanOnJapaneseInterface.titleVariants?.localized?.ja, undefined);
    assert.equal(koreanOnJapaneseInterface.titleVariants?.localized?.ko, "한국어 원제");
  });

  it("handles Chinese-origin AniList native titles and converts script without treating synonyms as translation", () => {
    const mainland = { id: 29, countryOfOrigin: "CN", title: {
      native: "简体标题", romaji: "Jianti Biaoti", english: "English",
    }, synonyms: ["另一個名字"] };
    const taiwan = { ...mainland, id: 30, countryOfOrigin: "TW", title: {
      native: "臺灣正式標題", romaji: "Taiwan", english: "English",
    } };
    const zhTw = withActiveLocale("zh-TW", () => normalizeAniListMedia(mainland, "anime"));
    assert.equal(zhTw.title, "簡體標題");
    assert.deepEqual(zhTw.titleScriptConversions, { "zh-TW": "簡體標題" });
    assert.equal(zhTw.titleVariants?.localized?.["zh-CN"], "简体标题");
    assert.equal(zhTw.titleVariants?.localized?.["zh-TW"], undefined);
    const zhCn = withActiveLocale("zh-CN", () => normalizeAniListMedia(taiwan, "anime"));
    assert.equal(zhCn.title, "台湾正式标题");
    assert.deepEqual(zhCn.titleScriptConversions, { "zh-CN": "台湾正式标题" });
    assert.equal(zhCn.titleVariants?.localized?.["zh-TW"], "臺灣正式標題");
    const original = withActiveLocale("zh-TW", () => normalizeAniListMedia(taiwan, "anime"));
    assert.equal(original.title, "臺灣正式標題");
    assert.equal(original.titleScriptConversions, undefined);
    assert.ok(original.searchTitles?.includes("另一個名字"));
  });

  it("retains Open Library work titles and authors without inventing translations", () => {
    const raw = {
      key: "/works/OL321W", title: "The Original Work", first_publish_year: 2011,
      author_name: ["A. Writer"], subject: ["Fiction"],
    };
    const traditional = withActiveLocale("zh-TW", () => normalizeOpenLibraryBook(raw));
    const korean = withActiveLocale("ko", () => normalizeOpenLibraryBook(raw));
    assert.equal(traditional.title, "The Original Work");
    assert.equal(korean.title, "The Original Work");
    assert.equal(traditional.originalTitle, "The Original Work");
    assert.equal(traditional.titleVariants?.fallback, "The Original Work");
    assert.equal(traditional.titleVariants?.localized?.["zh-TW"], undefined);
    assert.equal(traditional.titleScriptConversions, undefined);
    assert.deepEqual(traditional.people, ["A. Writer"]);
    const markdown = note(traditional);
    assert.match(markdown, /title_original: "The Original Work"/);
    assert.doesNotMatch(markdown, /title_script_conversions:/);
  });

  it("uses the interface language for Open Library edition preference without claiming an official localization", () => {
    assert.equal(openLibrarySearchLanguage("zh-TW"), "zh");
    assert.equal(openLibrarySearchLanguage("zh-CN"), "zh");
    assert.equal(openLibrarySearchLanguage("en"), "en");
    assert.equal(openLibrarySearchLanguage("ja"), "ja");
    assert.equal(openLibrarySearchLanguage("ko"), "ko");
  });

  it("resolves verified titles before script conversion and preserves source variants on relocalization", () => {
    const api = withActiveLocale("zh-CN", () => normalizeBangumiSubject({
      id: 44, name: "日本語原題", name_cn: "简体标题", infobox: [],
    }, "anime"));
    const immutable = structuredClone(api);
    const tw = localizeExternalMediaResult(api, "zh-TW");
    const cnAgain = localizeExternalMediaResult(tw, "zh-CN");
    assert.equal(tw.title, "簡體標題");
    assert.deepEqual(tw.titleScriptConversions, { "zh-TW": "簡體標題" });
    assert.equal(cnAgain.title, "简体标题");
    assert.equal(cnAgain.titleScriptConversions, undefined);
    assert.deepEqual(api, immutable);
    assert.equal(tw.titleVariants?.fallback, api.titleVariants?.fallback);
    assert.ok(tw.searchTitles?.includes("简体标题"));
    assert.ok(tw.searchTitles?.includes("日本語原題"));

    const official = selectNewMediaTitle({
      fallback: "简体标题",
      localized: { "zh-TW": "臺灣正式標題", "zh-CN": "简体标题" },
    }, "zh-TW");
    assert.deepEqual(official, { title: "臺灣正式標題" });
    assert.equal(chineseScriptCandidate({ fallback: "Original", localized: { en: "English" } }, "zh-TW"), null);
  });

  it("keeps custom names and source metadata intact when creating a note", () => {
    const media = withActiveLocale("zh-TW", () => normalizeBangumiSubject({
      id: 90, name: "日本語原題", name_cn: "简体标题",
      infobox: [{ key: "作者", value: "著者氏名" }],
    }, "novel"));
    const markdown = note(media, "我的自訂名稱");
    assert.match(markdown, /title: "我的自訂名稱"/);
    assert.match(markdown, /title_original: "日本語原題"/);
    assert.doesNotMatch(markdown, /title_script_conversions:/);
    assert.match(markdown, /著者氏名/);
    assert.match(markdown, /title_localizations:\n  zh-CN: "简体标题"/);
  });

  it("never fabricates a localized title from an unlabelled synonym", () => {
    const selected = selectNewMediaTitle({
      fallback: "English title", original: "日本語原題",
      localized: { en: "English title" },
    }, "zh-TW");
    assert.deepEqual(selected, { title: "English title" });
  });
});

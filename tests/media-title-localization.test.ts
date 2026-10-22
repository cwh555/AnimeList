import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withActiveLocale } from "../src/i18n/catalog";
import { resolveMediaTitle } from "../src/domain/media-title-localization";
import { normalizeAniListMedia, normalizeBangumiSubject } from "../src/data/provider-normalizers";

describe("provenance-aware media title localization", () => {
  it("prefers an explicitly labeled title and never invents missing translations", () => {
    const titles = {
      fallback: "Fallback",
      original: "日本語原題",
      romaji: "Romaji",
      localized: { "zh-CN": "简体中文名", "zh-TW": "繁體中文名", en: "Official English" },
    };
    assert.equal(resolveMediaTitle(titles, "zh-TW"), "繁體中文名");
    assert.equal(resolveMediaTitle(titles, "zh-CN"), "简体中文名");
    assert.equal(resolveMediaTitle(titles, "en"), "Official English");
    assert.equal(resolveMediaTitle(titles, "ja"), "日本語原題");
    assert.equal(resolveMediaTitle(titles, "ko"), "日本語原題");
    assert.equal(resolveMediaTitle({ fallback: "Known", localized: { en: "" } }, "en"), "Known");
  });

  it("selects Bangumi Chinese title variants without mutating the original or creators", () => {
    const subject = {
      id: 125,
      name: "日本語原題",
      name_cn: "简体中文标题",
      infobox: [
        { key: "繁體中文名", value: "繁體中文標題" },
        { key: "動畫製作", value: "架空制作社" },
      ],
    };
    const simplified = withActiveLocale("zh-CN", () => normalizeBangumiSubject(subject, "anime"));
    const traditional = withActiveLocale("zh-TW", () => normalizeBangumiSubject(subject, "anime"));
    const english = withActiveLocale("en", () => normalizeBangumiSubject(subject, "anime"));
    assert.equal(simplified.title, "简体中文标题");
    assert.equal(traditional.title, "繁體中文標題");
    assert.equal(english.title, "日本語原題");
    assert.equal(traditional.originalTitle, "日本語原題");
    assert.ok(simplified.searchTitles?.includes("繁體中文標題"));
    assert.ok(simplified.searchTitles?.includes("日本語原題"));
    assert.deepEqual(traditional.people, simplified.people);
  });

  it("automatically converts Bangumi simplified-only titles for newly imported Traditional Chinese notes", () => {
    const raw = { id: 88, name: "日本語原題", name_cn: "简体标题", infobox: [] };
    const tw = withActiveLocale("zh-TW", () => normalizeBangumiSubject(raw, "anime"));
    const cn = withActiveLocale("zh-CN", () => normalizeBangumiSubject(raw, "anime"));
    assert.equal(tw.title, "簡體標題");
    assert.equal(cn.title, "简体标题");
    assert.deepEqual(tw.titleScriptConversions, { "zh-TW": "簡體標題" });
    assert.equal(tw.titleVariants?.localized?.["zh-TW"], undefined);
    assert.equal(tw.titleVariants?.localized?.["zh-CN"], "简体标题");
    assert.equal(tw.originalTitle, "日本語原題");
    assert.equal(cn.titleScriptConversions, undefined);
  });

  it("prioritizes verified Traditional Chinese titles over script conversion on new imports", () => {
    const raw = { id: 88, name: "原題", name_cn: "简体标题", infobox: [
      { key: "繁體中文名", value: "臺灣正式名稱" },
    ] };
    const tw = withActiveLocale("zh-TW", () => normalizeBangumiSubject(raw, "anime"));
    assert.equal(tw.title, "臺灣正式名稱");
    assert.equal(tw.titleScriptConversions, undefined);
  });

  it("uses AniList English/native only where their language is known", () => {
    const media = {
      id: 42,
      title: { english: "Official English", romaji: "Romaji", native: "日本語原題" },
      synonyms: ["Alias for search"],
    };
    const english = withActiveLocale("en", () => normalizeAniListMedia(media, "anime"));
    const japanese = withActiveLocale("ja", () => normalizeAniListMedia(media, "anime"));
    const chinese = withActiveLocale("zh-CN", () => normalizeAniListMedia(media, "anime"));
    assert.equal(english.title, "Official English");
    assert.equal(japanese.title, "日本語原題");
    assert.equal(chinese.title, "Official English");
    assert.equal(chinese.originalTitle, "日本語原題");
    assert.ok(chinese.searchTitles?.includes("Alias for search"));
    assert.ok(chinese.searchTitles?.includes("Romaji"));
  });
});

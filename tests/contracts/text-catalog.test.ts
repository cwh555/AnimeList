import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { masterpieceFeatureText } from "../../src/masterpiece-feature-text";
import { legacyMetadataText } from "../../src/legacy-metadata-text";
import { userTagText } from "../../src/user-tag-text";
import { BUNDLED_LOCALE_CATALOGS, registerBundledLocales } from "../../src/i18n/locales";
import { normalizeSupportedLocale, resolveInterfaceLocale } from "../../src/i18n/locale";
import {
  PROGRESS_UNIT_FEATURE_TEXT,
  progressUnitFeatureText,
} from "../../src/progress-unit-feature-text";
import { RATING_FEATURE_TEXT, ratingFeatureText } from "../../src/rating-feature-text";
import { scoreDashboardText } from "../../src/score-dashboard-text";
import { searchFeatureText } from "../../src/search-feature-text";
import { SERIAL_COVER_TEXT, serialCoverText } from "../../src/serial-cover-text";
import {
  registerLocaleMessages,
  resetLocaleForTests,
  setActiveLocale,
  withActiveLocale,
} from "../../src/i18n/catalog";
import {
  localizeProviderTag,
  providerTagDisplayLabels,
} from "../../src/i18n/provider-tag-localization";
import { libraryProviderTagLabels } from "../../src/ui/library-tag-localization";
import { UI_TEXT, uiText } from "../../src/ui-text";

function assertNonEmptyCatalog(catalog: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "string") assert.ok(value.trim(), `${key} must not be empty`);
    else assert.equal(typeof value, "function", `${key} must be text or a formatter`);
  }
}

describe("user-visible text catalog compatibility", () => {
  it("keeps every exported catalog entry non-empty", () => {
    assertNonEmptyCatalog(UI_TEXT);
    assertNonEmptyCatalog(RATING_FEATURE_TEXT);
    assertNonEmptyCatalog(SERIAL_COVER_TEXT);
    assertNonEmptyCatalog(scoreDashboardText);
    assertNonEmptyCatalog(PROGRESS_UNIT_FEATURE_TEXT.unit);
    assertNonEmptyCatalog(Object.fromEntries(
      Object.entries(PROGRESS_UNIT_FEATURE_TEXT).filter(([key]) => key !== "unit"),
    ));
  });

  it("interpolates named variables without deleting unknown future placeholders", () => {
    assert.equal(
      uiText("library.resultMeta", { shown: 2, total: 8, genre: " · 戀愛" }),
      "顯示 2，共 8 部 · 戀愛",
    );
    assert.equal(
      progressUnitFeatureText("timelineEntryTitle", { title: "作品", label: 3, unit: "卷" }),
      "作品 — 第 3 卷",
    );
    assert.equal(
      serialCoverText("settings.progressCount", { completed: 4, total: 10 }),
      "4 / 10",
    );
    assert.match(uiText("library.resultMeta", { shown: 1, total: 2 }), /\{genre}/);
  });

  it("keeps feature text helpers stable for later locale replacement", () => {
    assert.equal(ratingFeatureText("adjusted", { original: 8.2, rounded: 8 }), "評分 8.2 不符合 0.5 分級距，已四捨五入為 8。");
    assert.equal(searchFeatureText("duplicate.warning.open"), "開啟既有筆記");
    assert.equal(masterpieceFeatureText("modal.save"), "儲存");
    assert.equal(scoreDashboardText.selected(3), "已選 3 部");
  });


  it("keeps bundled locales complete with matching interpolation placeholders", () => {
    const placeholderNames = (value: string): string[] => [...value.matchAll(/\{([A-Za-z0-9_.-]+)\}/g)]
      .map((match) => match[1] ?? "")
      .sort();
    const reference = BUNDLED_LOCALE_CATALOGS["zh-TW"];
    for (const [locale, catalogs] of Object.entries(BUNDLED_LOCALE_CATALOGS)) {
      for (const namespace of Object.keys(reference) as Array<keyof typeof reference>) {
        const baseMessages = reference[namespace] as Record<string, string>;
        const localized = catalogs[namespace] as Record<string, string>;
        assert.deepEqual(Object.keys(localized).sort(), Object.keys(baseMessages).sort(), `${locale}.${namespace} keys`);
        for (const [key, template] of Object.entries(baseMessages)) {
          assert.deepEqual(
            placeholderNames(localized[key] ?? ""),
            placeholderNames(template),
            `${locale}.${namespace}.${key} placeholders`,
          );
        }
      }
    }
  });

  it("switches all catalog namespaces between bundled interface languages", () => {
    registerBundledLocales();
    const cases = [
      ["zh-TW", "收藏庫", "儲存", "Tags"],
      ["en", "Library", "Save", "Tags"],
      ["ja", "ライブラリ", "保存", "タグ"],
      ["ko", "라이브러리", "저장", "태그"],
    ] as const;
    try {
      for (const [locale, libraryTitle, save, tagHeading] of cases) {
        setActiveLocale(locale);
        assert.equal(uiText("library.title"), libraryTitle);
        assert.equal(masterpieceFeatureText("modal.save"), save);
        assert.equal(userTagText("settings.heading"), tagHeading);
        assert.ok(legacyMetadataText("settings.button").trim());
        assert.ok(serialCoverText("search").trim());
        assert.ok(scoreDashboardText.title.trim());
      }
    } finally {
      resetLocaleForTests();
    }
  });

  it("normalizes explicit and system locale preferences deterministically", () => {
    assert.equal(normalizeSupportedLocale("zh-Hant-TW"), "zh-TW");
    assert.equal(normalizeSupportedLocale("en-US"), "en");
    assert.equal(normalizeSupportedLocale("ja_JP"), "ja");
    assert.equal(normalizeSupportedLocale("ko-KR"), "ko");
    assert.equal(resolveInterfaceLocale("system", "ja-JP"), "ja");
    assert.equal(resolveInterfaceLocale("system", "fr-FR"), "zh-TW");
    assert.equal(resolveInterfaceLocale("en", "ja-JP"), "en");
  });


  it("temporarily scopes locale changes without leaking global state", () => {
    registerBundledLocales();
    setActiveLocale("ja");
    try {
      assert.equal(uiText("library.title"), "ライブラリ");
      assert.equal(withActiveLocale("en", () => uiText("library.title")), "Library");
      assert.equal(uiText("library.title"), "ライブラリ");
    } finally {
      resetLocaleForTests();
    }
  });

  it("localizes only values explicitly marked as provider/API tags", () => {
    const ja = providerTagDisplayLabels([
      "Action",
      "動作",
      "Coming of Age",
      "Female Protagonist",
      "Custom API tag",
    ], "ja");
    assert.equal(ja.get("Action"), "アクション");
    assert.equal(ja.get("動作"), "アクション");
    assert.equal(ja.get("Coming of Age"), "成長");
    assert.equal(ja.get("Female Protagonist"), "女性主人公");
    assert.equal(ja.get("Custom API tag"), "Custom API tag");
    assert.equal(ja.has("Custom user tag"), false);

    const ko = providerTagDisplayLabels(["Romance", "Primarily Female Cast"], "ko");
    assert.equal(ko.get("Romance"), "로맨스");
    assert.equal(ko.get("Primarily Female Cast"), "여성 캐릭터 중심");
  });

  it("localizes Library API tags by per-item provenance without translating user tags", () => {
    setActiveLocale("ja");
    assert.deepEqual(
      libraryProviderTagLabels({
        genres: ["動作", "收藏", "校園"],
        apiTagValues: ["Action", "動作", "School", "校園"],
      }),
      ["アクション", "收藏", "学園"],
    );
  });

  it("keeps unknown provider values unchanged instead of guessing a translation", () => {
    assert.equal(localizeProviderTag("Unknown provider tag", "zh-TW"), "Unknown provider tag");
    assert.equal(localizeProviderTag("Unknown provider tag", "ja"), "Unknown provider tag");
  });

  it("supports partial locale registration with per-key fallback", () => {
    registerLocaleMessages("core", "test-partial", {
      "action.delete": "Delete",
    });
    registerLocaleMessages("core", "test-partial", {
      "library.resultMeta": "Showing {shown} of {total}{genre}",
    });
    registerLocaleMessages("rating", "test-partial", {
      adjusted: "Rating {original} was rounded to {rounded}.",
    });
    setActiveLocale("test-partial");
    try {
      assert.equal(uiText("action.delete"), "Delete");
      assert.equal(
        uiText("library.resultMeta", { shown: 2, total: 5, genre: "" }),
        "Showing 2 of 5",
      );
      assert.equal(uiText("action.collect"), UI_TEXT["action.collect"]);
      assert.equal(
        ratingFeatureText("adjusted", { original: 8.2, rounded: 8 }),
        "Rating 8.2 was rounded to 8.",
      );
    } finally {
      resetLocaleForTests();
    }
  });

});

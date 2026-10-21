import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withActiveLocale } from "../src/i18n/catalog";
import { titleLocalizationSettingsText } from "../src/features/title-localization/text";

describe("Settings English-only title update protocol", () => {
  it("keeps setting and operation messages in English for every interface language", () => {
    for (const locale of ["zh-TW", "zh-CN", "en", "ja", "ko"]) {
      withActiveLocale(locale, () => {
        assert.equal(titleLocalizationSettingsText("settings.button"), "Preview title updates");
        assert.equal(titleLocalizationSettingsText("modal.preview"), "Scan and preview");
        assert.equal(titleLocalizationSettingsText("modal.language"), "Target language");
        assert.equal(titleLocalizationSettingsText("modal.scanning", { completed: 2, total: 5 }), "Checking titles 2 / 5…");
      });
    }
  });
});

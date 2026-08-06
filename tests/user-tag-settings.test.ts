import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { userTagSettingsFeature } from "../src/user-tag-settings";
import { createDefaultSettings } from "../src/settings-model";

describe("user tag settings feature", () => {
  it("seeds existing library tags and keeps tags after a work later removes them", async () => {
    const settings = createDefaultSettings();
    settings.tagCatalog = ["收藏"];
    let saves = 0;
    const host = {
      settings,
      collectMediaItems: () => [{ genres: ["戀愛", "重看"], userTags: [] }],
      saveSettings: async () => { saves += 1; },
    } as any;

    const lifecycle = userTagSettingsFeature.contributions.find((entry) => entry.kind === "lifecycle");
    assert.ok(lifecycle && lifecycle.kind === "lifecycle");
    await lifecycle.activate(host);
    assert.deepEqual(settings.tagCatalog, ["收藏", "戀愛", "重看"]);
    assert.equal(saves, 1);

    const mediaForm = userTagSettingsFeature.contributions.find((entry) => entry.kind === "media-form");
    assert.ok(mediaForm && mediaForm.kind === "media-form" && mediaForm.prepareSubmit);
    await mediaForm.prepareSubmit({ host, form: { genres: ["新標籤"] } } as any);
    assert.deepEqual(settings.tagCatalog, ["收藏", "戀愛", "重看", "新標籤"]);
    assert.equal(saves, 2);

    await mediaForm.prepareSubmit({ host, form: { genres: ["戀愛"] } } as any);
    assert.deepEqual(settings.tagCatalog, ["收藏", "戀愛", "重看", "新標籤"]);
    assert.equal(saves, 2);
  });
});

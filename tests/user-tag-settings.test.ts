import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnimeListFeatureRegistry } from "../src/app/feature-registry";
import { userTagSettingsFeature } from "../src/user-tag-settings";
import { createDefaultSettings } from "../src/settings-model";
import { createUserTagSettingsSection } from "../src/user-tag-settings";
import { userTagText } from "../src/user-tag-text";

describe("user tag settings feature", () => {
  it("does not scan the Library during plugin activation", async () => {
    const settings = createDefaultSettings();
    const registry = new AnimeListFeatureRegistry<any>();
    registry.load([userTagSettingsFeature as any]);
    const host = {
      settings,
      collectMediaItems: () => { throw new Error("Library must not be read during activation"); },
      saveSettings: async () => undefined,
    } as any;

    await registry.activate(host);
    assert.deepEqual(settings.tagCatalog, []);
  });

  it("preserves tags removed from one work by cataloging both the previous and submitted selection", async () => {
    const settings = createDefaultSettings();
    settings.tagCatalog = ["收藏"];
    let saves = 0;
    const host = {
      settings,
      saveSettings: async () => { saves += 1; },
    } as any;

    const mediaForm = userTagSettingsFeature.contributions.find((entry) => entry.kind === "media-form");
    assert.ok(mediaForm && mediaForm.kind === "media-form" && mediaForm.prepareSubmit);
    await mediaForm.prepareSubmit({
      host,
      mode: "edit",
      frontmatter: { genres: ["戀愛", "重看"] },
      form: { genres: ["戀愛"] },
    } as any);
    assert.deepEqual(settings.tagCatalog, ["收藏", "戀愛", "重看"]);
    assert.equal(saves, 1);

    await mediaForm.prepareSubmit({
      host,
      mode: "edit",
      frontmatter: { genres: ["戀愛"] },
      form: { genres: ["戀愛"] },
    } as any);
    assert.deepEqual(settings.tagCatalog, ["收藏", "戀愛", "重看"]);
    assert.equal(saves, 1);
  });

  it("keeps the settings surface and tag manager copy in English", () => {
    const section = createUserTagSettingsSection({} as any);
    assert.equal(section.heading, "Tags");
    assert.equal(section.description, "Manage reusable work tags without crowding the settings page.");
    assert.equal(section.definitions[0].name, "Tag manager");
    assert.equal(userTagText("settings.manage"), "Manage tags…");
    assert.equal(userTagText("manager.usedBy", { count: 3 }), "Used by 3 works");
    assert.doesNotMatch([
      userTagText("settings.heading"),
      userTagText("settings.description"),
      userTagText("settings.name"),
      userTagText("settings.desc"),
      userTagText("settings.manage"),
      userTagText("manager.title"),
      userTagText("manager.description"),
      userTagText("manager.rename"),
      userTagText("manager.delete"),
      userTagText("manager.cancel"),
    ].join(" "), /[^\x00-\x7F…←×]/);
  });
});

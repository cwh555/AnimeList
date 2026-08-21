import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Setting } from "obsidian";
import type { AnimeListFeatureHost } from "../src/app/feature-types";
import { createReleaseTrackingSettingsSection } from "../src/features/release-tracking/settings";
import { createDefaultSettings } from "../src/app/settings-model";

describe("release tracking settings", () => {
  it("exposes an explicit opt-in toggle, daily check toggle, and manual check action", () => {
    const settings = createDefaultSettings();
    const host = {
      settings,
      saveSettings: async () => undefined,
      refreshViews: () => undefined,
    } as unknown as AnimeListFeatureHost;
    const section = createReleaseTrackingSettingsSection(host);

    assert.equal(section.heading, "Latest release tracking");
    assert.equal(settings.releaseTracking.enabled, false);
    assert.equal(settings.releaseTracking.automatic, false);
    assert.deepEqual(section.definitions.map((definition) => definition.name), [
      "Fetch latest release information",
      "Check automatically once per day",
      "維護追蹤作品",
      "Check now",
    ]);
    for (const definition of section.definitions) {
      assert.equal(definition.visible?.() ?? true, true);
      definition.render?.(new Setting({} as HTMLElement));
    }
  });
});

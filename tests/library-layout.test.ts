import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Setting } from "obsidian";
import type { AnimeListFeatureHost } from "../src/app/feature-types";
import { createDefaultSettings } from "../src/app/settings-model";
import { createLibraryLayoutSettingsSection } from "../src/features/library-layout/settings";
import { registerLocaleMessages, withActiveLocale } from "../src/i18n/catalog";
import { EN_LIBRARY_LAYOUT_MESSAGES } from "../src/i18n/locales/en/library-layout";
import {
  DEFAULT_LIBRARY_LAYOUT_COLUMNS,
  MAX_LIBRARY_LAYOUT_COLUMNS,
  MIN_LIBRARY_LAYOUT_COLUMNS,
  libraryColumnsForView,
  libraryLayoutColumnsWithView,
  normalizeLibraryLayoutColumnCount,
  normalizeLibraryLayoutColumns,
} from "../src/domain/library-layout";

describe("library layout columns", () => {
  it("defaults Card to five columns and Thumbnail to three", () => {
    assert.deepEqual(normalizeLibraryLayoutColumns(undefined), {
      ...DEFAULT_LIBRARY_LAYOUT_COLUMNS,
    });
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "grid"), 5);
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "poster"), 3);
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "list"), null);
  });

  it("normalizes persisted values to the supported 1–6 range", () => {
    assert.equal(normalizeLibraryLayoutColumnCount(0), MIN_LIBRARY_LAYOUT_COLUMNS);
    assert.equal(normalizeLibraryLayoutColumnCount(4.6), 5);
    assert.equal(normalizeLibraryLayoutColumnCount(99), MAX_LIBRARY_LAYOUT_COLUMNS);
    assert.equal(normalizeLibraryLayoutColumnCount("bad"), DEFAULT_LIBRARY_LAYOUT_COLUMNS.poster);
    assert.equal(normalizeLibraryLayoutColumnCount("bad", DEFAULT_LIBRARY_LAYOUT_COLUMNS.grid), 5);
    assert.deepEqual(normalizeLibraryLayoutColumns({ grid: 5, poster: 2 }), { grid: 5, poster: 2 });
  });

  it("updates one visual mode without changing the other", () => {
    const initial = { grid: 3, poster: 4 };
    assert.deepEqual(libraryLayoutColumnsWithView(initial, "grid", 6), { grid: 6, poster: 4 });
    assert.deepEqual(libraryLayoutColumnsWithView(initial, "poster", 1), { grid: 3, poster: 1 });
  });

  it("edits Card and Thumbnail row counts through General settings", async () => {
    const settings = createDefaultSettings();
    let saves = 0;
    let refreshes = 0;
    const host = {
      settings,
      async saveSettings() { saves += 1; },
      refreshViews() { refreshes += 1; },
    } as unknown as AnimeListFeatureHost;
    registerLocaleMessages("library-layout", "en", EN_LIBRARY_LAYOUT_MESSAGES);
    const section = withActiveLocale("en", () => createLibraryLayoutSettingsSection(host));

    assert.equal(section.page, "general");
    assert.equal(section.heading, "Library layout");
    assert.deepEqual(section.definitions.map((definition) => definition.name), [
      "Card items per row",
      "Thumbnail items per row",
    ]);

    interface SliderLike {
      setLimits(min: number | null, max: number | null, step: number): this;
      setValue(value: number): this;
      setDynamicTooltip(): this;
      onChange(callback: (value: number) => void | Promise<void>): this;
    }
    const registered: Array<{ value: number; onChange: (value: number) => void | Promise<void> }> = [];
    for (const definition of section.definitions) {
      let value = -1;
      let change: ((next: number) => void | Promise<void>) | null = null;
      const slider = {
        setLimits(min: number | null, max: number | null, step: number) {
          assert.equal(min, 1);
          assert.equal(max, 6);
          assert.equal(step, 1);
          return this;
        },
        setValue(next: number) { value = next; return this; },
        setDynamicTooltip() { return this; },
        onChange(callback: (next: number) => void | Promise<void>) { change = callback; return this; },
      } as SliderLike;
      const setting = {
        addSlider(callback: (component: SliderLike) => void) { callback(slider); return this; },
      } as unknown as Setting;
      definition.render?.(setting);
      if (change === null) throw new Error("Library layout slider change handler was not registered");
      registered.push({ value, onChange: change });
    }

    assert.deepEqual(registered.map((entry) => entry.value), [5, 3]);
    await registered[0]!.onChange(4);
    assert.deepEqual(settings.uiState.layoutColumns, { grid: 4, poster: 3 });
    await registered[1]!.onChange(6);
    assert.deepEqual(settings.uiState.layoutColumns, { grid: 4, poster: 6 });
    assert.equal(saves, 2);
    assert.equal(refreshes, 2);
  });
});

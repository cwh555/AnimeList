import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  it("defaults both scalable Library views to three columns", () => {
    assert.deepEqual(normalizeLibraryLayoutColumns(undefined), {
      grid: DEFAULT_LIBRARY_LAYOUT_COLUMNS,
      poster: DEFAULT_LIBRARY_LAYOUT_COLUMNS,
    });
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "grid"), 3);
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "poster"), 3);
    assert.equal(libraryColumnsForView(normalizeLibraryLayoutColumns(undefined), "list"), null);
  });

  it("normalizes persisted values to the supported 1–6 range", () => {
    assert.equal(normalizeLibraryLayoutColumnCount(0), MIN_LIBRARY_LAYOUT_COLUMNS);
    assert.equal(normalizeLibraryLayoutColumnCount(4.6), 5);
    assert.equal(normalizeLibraryLayoutColumnCount(99), MAX_LIBRARY_LAYOUT_COLUMNS);
    assert.equal(normalizeLibraryLayoutColumnCount("bad"), DEFAULT_LIBRARY_LAYOUT_COLUMNS);
    assert.deepEqual(normalizeLibraryLayoutColumns({ grid: 5, poster: 2 }), { grid: 5, poster: 2 });
  });

  it("updates one visual mode without changing the other", () => {
    const initial = { grid: 3, poster: 4 };
    assert.deepEqual(libraryLayoutColumnsWithView(initial, "grid", 6), { grid: 6, poster: 4 });
    assert.deepEqual(libraryLayoutColumnsWithView(initial, "poster", 1), { grid: 3, poster: 1 });
  });
});

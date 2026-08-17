import assert from "node:assert/strict";
import test from "node:test";
import { AnimeListFeatureRegistry } from "../../src/app/feature-registry";
import { defineFeature, type AnimeListFeatureHost } from "../../src/app/feature-types";

const host = {} as AnimeListFeatureHost;

test("feature lifecycle contributions run in manifest declaration order", async () => {
  const calls: string[] = [];
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  registry.load([
    defineFeature({ id: "first", contributions: [{ kind: "lifecycle", activate: () => { calls.push("first"); } }] }),
    defineFeature({ id: "second", contributions: [{ kind: "lifecycle", activate: async () => { calls.push("second"); } }] }),
    defineFeature({ id: "third", contributions: [{ kind: "lifecycle", activate: () => { calls.push("third"); } }] }),
  ]);

  await registry.activate(host);
  assert.deepEqual(calls, ["first", "second", "third"]);
});

test("feature manifests reject duplicate ids before activation", () => {
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  assert.throws(() => registry.load([
    defineFeature({ id: "duplicate", contributions: [] }),
    defineFeature({ id: "duplicate", contributions: [] }),
  ]), /Duplicate feature: duplicate/);
});

test("feature manifests validate dependencies and declaration order", () => {
  const missing = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  assert.throws(() => missing.load([
    defineFeature({ id: "dependent", dependsOn: ["base"], contributions: [] }),
  ]), /depends on missing feature: base/);

  const reversed = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  assert.throws(() => reversed.load([
    defineFeature({ id: "dependent", dependsOn: ["base"], contributions: [] }),
    defineFeature({ id: "base", contributions: [] }),
  ]), /must appear earlier/);
});

test("feature registry assigns settings sections to stable pages and preserves overrides", () => {
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  registry.load([
    defineFeature({
      id: "release-tracking",
      contributions: [{
        kind: "settings",
        sections: () => ({ heading: "Release tracking", definitions: [] }),
      }],
    }),
    defineFeature({
      id: "legacy-metadata-cleanup-settings",
      contributions: [{
        kind: "settings",
        sections: () => ({ heading: "Legacy metadata", definitions: [] }),
      }],
    }),
    defineFeature({
      id: "custom-feature",
      contributions: [{
        kind: "settings",
        sections: () => ({ page: "search-metadata", heading: "Custom", definitions: [] }),
      }],
    }),
  ]);

  assert.deepEqual(
    registry.settingsSections(host).map((section) => [section.heading, section.page]),
    [
      ["Release tracking", "features"],
      ["Legacy metadata", "updates-cleanup"],
      ["Custom", "search-metadata"],
    ],
  );
});

test("feature registry cannot be loaded twice", () => {
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  registry.load([]);
  assert.throws(() => registry.load([]), /already loaded/);
});

test("feature lifecycle cannot activate twice", async () => {
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  registry.load([]);
  await registry.activate(host);
  await assert.rejects(registry.activate(host), /already activated/);
});


test("feature registry exposes typed workspace pages and menu actions in manifest order", () => {
  const registry = new AnimeListFeatureRegistry<AnimeListFeatureHost>();
  registry.load([
    defineFeature({
      id: "images",
      contributions: [{
        kind: "workspace-page",
        page: () => ({ id: "images", label: "Images", icon: "images", order: 40, render() {} }),
      }],
    }),
    defineFeature({
      id: "tools",
      contributions: [{
        kind: "workspace-action",
        action: () => ({ id: "updates", label: "Updates", order: 10, run() {} }),
      }],
    }),
  ]);

  assert.deepEqual(registry.workspacePageDefinitions(host).map((page) => page.id), ["images"]);
  assert.deepEqual(registry.workspaceMenuActions(host).map((action) => action.id), ["updates"]);
});

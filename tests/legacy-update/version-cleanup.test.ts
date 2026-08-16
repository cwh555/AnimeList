import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TFile, TFolder } from "obsidian";
import {
  findLegacyDefaultCoverCandidate,
  removeLegacyDefaultCoverLine,
} from "../../src/domain/version-cleanup";
import {
  applyDuplicateDefaultCoverCleanup,
  planDuplicateDefaultCoverCleanup,
} from "../../src/data/version-cleanup-service";
import { createVersionCleanupSettingsSection } from "../../src/features/version-cleanup/settings";
import { createLegacyMetadataSettingsSection } from "../../src/features/legacy-metadata-cleanup/settings";

function legacyNote(extraFrontmatter: Record<string, unknown> = {}): { markdown: string; frontmatter: Record<string, unknown> } {
  const frontmatter = {
    media_type: "anime",
    title: "Frieren",
    cover: "AnimeList/Covers/frieren.jpg",
    ...extraFrontmatter,
  };
  const markdown = [
    "---",
    "media_type: anime",
    "title: Frieren",
    "cover: AnimeList/Covers/frieren.jpg",
    "---",
    "# Frieren",
    "",
    "```animelist-detail",
    "```",
    "",
    "![[AnimeList/Covers/frieren.jpg|260]]",
    "",
    "## Notes",
    "Keep this text and ![[AnimeList/Covers/other.jpg|260]].",
    "",
  ].join("\n");
  return { markdown, frontmatter };
}

function fakeApp(entries: Array<{ path: string; markdown: string; frontmatter: Record<string, unknown> }>) {
  const files = entries.map((entry) => {
    const file = new TFile();
    file.path = entry.path;
    file.basename = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? entry.path;
    file.extension = "md";
    return file;
  });
  const content = new Map(entries.map((entry) => [entry.path, entry.markdown]));
  const fm = new Map(entries.map((entry) => [entry.path, entry.frontmatter]));
  const modified: string[] = [];
  const folder = new TFolder();
  folder.path = "AnimeList/Anime";
  folder.children = files;
  return {
    app: {
      vault: {
        getMarkdownFiles: () => files,
        getRoot: () => ({ children: [] }),
        getAbstractFileByPath: (path: string) => path === folder.path
          ? folder
          : files.find((file) => file.path === path) ?? null,
        cachedRead: async (file: TFile) => content.get(file.path) ?? "",
        modify: async (file: TFile, next: string) => { content.set(file.path, next); modified.push(file.path); },
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: fm.get(file.path) }),
      },
    } as any,
    content,
    modified,
  };
}

describe("legacy update: duplicate default note covers", () => {
  it("targets only the exact old generated cover immediately after animelist-detail", () => {
    const { markdown, frontmatter } = legacyNote();
    const candidate = findLegacyDefaultCoverCandidate(markdown, frontmatter);
    assert.ok(candidate);
    assert.equal(candidate.coverPath, "AnimeList/Covers/frieren.jpg");
    const next = removeLegacyDefaultCoverLine(markdown, candidate);
    assert.equal(next.includes("![[AnimeList/Covers/frieren.jpg|260]]"), false);
    assert.match(next, /Keep this text and !\[\[AnimeList\/Covers\/other\.jpg\|260\]\]\./);
    assert.match(next, /```animelist-detail\n```\n\n## Notes/);
  });

  it("skips custom templates, mismatched covers, and ambiguous duplicate blocks", () => {
    const base = legacyNote();
    assert.equal(findLegacyDefaultCoverCandidate(base.markdown, { ...base.frontmatter, note_template: "Templates/Custom.md" }), null);
    assert.equal(findLegacyDefaultCoverCandidate(base.markdown, { ...base.frontmatter, cover: "AnimeList/Covers/other.jpg" }), null);
    const ambiguous = `${base.markdown}\n\n\`\`\`animelist-detail\n\`\`\`\n\n![[AnimeList/Covers/frieren.jpg|260]]\n`;
    assert.equal(findLegacyDefaultCoverCandidate(ambiguous, base.frontmatter), null);
  });

  it("plans first, then revalidates each note before applying the reviewed cleanup", async () => {
    const first = legacyNote();
    const second = legacyNote();
    const store = fakeApp([
      { path: "AnimeList/Anime/Frieren.md", ...first },
      { path: "AnimeList/Anime/Changed.md", ...second },
    ]);
    const plan = await planDuplicateDefaultCoverCleanup(store.app, ["AnimeList/Anime"]);
    assert.equal(plan.items.length, 2);

    store.content.set(
      "AnimeList/Anime/Changed.md",
      store.content.get("AnimeList/Anime/Changed.md")!.replace(
        "![[AnimeList/Covers/frieren.jpg|260]]",
        "User changed this after preview.",
      ),
    );
    const result = await applyDuplicateDefaultCoverCleanup(store.app, plan);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(store.modified, ["AnimeList/Anime/Frieren.md"]);
    assert.match(store.content.get("AnimeList/Anime/Changed.md")!, /User changed this after preview/);
  });

  it("groups version migrations together on the rightmost Updates & cleanup page", () => {
    const host = { app: {}, getScanFolders: () => [], refreshViews() {} } as any;
    const section = createVersionCleanupSettingsSection(host, () => {});
    const legacy = createLegacyMetadataSettingsSection(host, () => {});
    assert.equal(section.page, "updates-cleanup");
    assert.equal(section.heading, "Version updates");
    assert.deepEqual(section.definitions.map((definition) => definition.name), [
      "Remove duplicate note covers",
      "Upgrade legacy metadata",
    ]);
    assert.equal(legacy.heading, "Legacy metadata cleanup");
  });
});

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
import {
  applyMediaNoteFilenameCleanup,
  planMediaNoteFilenameCleanup,
} from "../../src/data/media-note-filename-cleanup";
import { createVersionCleanupSettingsSection } from "../../src/features/version-cleanup/settings";
import { createLegacyDataSettingsSection } from "../../src/features/legacy-data/settings";

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

function filenameCleanupApp(entries: Array<{ path: string; frontmatter: Record<string, unknown> }>) {
  const files = entries.map((entry) => {
    const file = new TFile();
    file.path = entry.path;
    file.basename = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? entry.path;
    file.extension = "md";
    return file;
  });
  const frontmatter = new Map<TFile, Record<string, unknown>>(
    files.map((file, index) => [file, entries[index].frontmatter]),
  );
  const byPath = new Map(files.map((file) => [file.path, file]));
  const folder = new TFolder();
  folder.path = "AnimeList/Anime";
  folder.children = files;
  const renames: Array<{ from: string; to: string }> = [];
  let modifyCalls = 0;
  const app = {
    vault: {
      getRoot: () => ({ children: [] }),
      getAbstractFileByPath: (path: string) => path === folder.path ? folder : byPath.get(path) ?? null,
      modify: async () => { modifyCalls += 1; },
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file) }),
    },
    fileManager: {
      renameFile: async (file: TFile, targetPath: string) => {
        const oldPath = file.path;
        byPath.delete(oldPath);
        file.path = targetPath;
        file.basename = targetPath.split("/").pop()?.replace(/\.md$/, "") ?? targetPath;
        byPath.set(targetPath, file);
        renames.push({ from: oldPath, to: targetPath });
      },
    },
  } as any;
  return { app, files, frontmatter, renames, getModifyCalls: () => modifyCalls };
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

  it("skips previously completed cover checks but a full rescan returns every eligible proposal", async () => {
    const old = legacyNote();
    const store = fakeApp([
      { path: "AnimeList/Anime/NeedsUpdate.md", ...old },
      { path: "AnimeList/Anime/Checked.md", ...old },
    ]);
    const pending = await planDuplicateDefaultCoverCleanup(store.app, ["AnimeList/Anime"],
      file => file.basename !== "Checked");
    assert.equal(pending.scanned, 1);
    assert.deepEqual(pending.items.map(x => x.path), ["AnimeList/Anime/NeedsUpdate.md"]);
    const full = await planDuplicateDefaultCoverCleanup(store.app, ["AnimeList/Anime"]);
    assert.equal(full.scanned, 2);
    assert.equal(full.items.length, 2);
  });

  it("keeps version fixes and legacy note tools in separate compact sections", () => {
    const host = { app: {}, getScanFolders: () => [], refreshViews() {} } as any;
    const version = createVersionCleanupSettingsSection(host, () => {});
    const legacy = createLegacyDataSettingsSection(host, () => {});
    assert.equal(version.page, "updates-cleanup");
    assert.equal(legacy.page, "updates-cleanup");
    assert.equal(version.heading, "Version updates");
    assert.equal(legacy.heading, "Legacy data");
    assert.deepEqual(version.definitions.map(d => d.name), ["Remove duplicate note covers"]);
    assert.deepEqual(legacy.definitions.map(d => d.name), [
      "Sync note filenames with titles", "Upgrade legacy metadata", "Update existing titles",
    ]);
    assert.match(String(legacy.definitions[0].desc), /without changing note content or frontmatter/);
    for (const section of [version, legacy]) {
      assert.ok((section.description ?? "").length < 90);
      for (const definition of section.definitions) {
        assert.ok(String(definition.desc ?? "").length < 120, definition.name);
      }
    }
  });
});

describe("legacy update: media note filenames", () => {
  it("keeps global filename collision reservations when only scanning unprocessed items", () => {
    const store = filenameCleanupApp([
      { path: "AnimeList/Anime/Old A.md", frontmatter: { media_type: "anime", title: "Shared" } },
      { path: "AnimeList/Anime/Old B.md", frontmatter: { media_type: "anime", title: "Shared" } },
    ]);
    const pending = planMediaNoteFilenameCleanup(store.app, ["AnimeList/Anime"],
      file => file.path.endsWith("Old B.md"));
    assert.equal(pending.items.length, 1);
    assert.equal(pending.items[0].targetPath, "AnimeList/Anime/Shared (2).md");
    const all = planMediaNoteFilenameCleanup(store.app, ["AnimeList/Anime"]);
    assert.deepEqual(all.items.map(x => x.targetPath), [
      "AnimeList/Anime/Shared.md", "AnimeList/Anime/Shared (2).md",
    ]);
  });

  it("plans collision-safe same-folder renames and never rewrites note content", async () => {
    const store = filenameCleanupApp([
      { path: "AnimeList/Anime/Old Frieren.md", frontmatter: { media_type: "anime", title: "Frieren" } },
      { path: "AnimeList/Anime/Already.md", frontmatter: { media_type: "anime", title: "Already" } },
      { path: "AnimeList/Anime/Old Duplicate.md", frontmatter: { media_type: "anime", title: "Already" } },
      { path: "AnimeList/Anime/ordinary.md", frontmatter: { title: "Not AnimeList" } },
    ]);

    const plan = planMediaNoteFilenameCleanup(store.app, ["AnimeList/Anime"]);
    assert.equal(plan.scanned, 3);
    assert.deepEqual(plan.items, [
      { path: "AnimeList/Anime/Old Duplicate.md", title: "Already", targetPath: "AnimeList/Anime/Already (2).md" },
      { path: "AnimeList/Anime/Old Frieren.md", title: "Frieren", targetPath: "AnimeList/Anime/Frieren.md" },
    ]);

    const result = await applyMediaNoteFilenameCleanup(store.app, plan);
    assert.equal(result.renamed, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
    assert.deepEqual(store.renames, [
      { from: "AnimeList/Anime/Old Duplicate.md", to: "AnimeList/Anime/Already (2).md" },
      { from: "AnimeList/Anime/Old Frieren.md", to: "AnimeList/Anime/Frieren.md" },
    ]);
    assert.equal(store.getModifyCalls(), 0);
  });

  it("revalidates reviewed title and destination before applying a legacy rename", async () => {
    const store = filenameCleanupApp([
      { path: "AnimeList/Anime/Old.md", frontmatter: { media_type: "anime", title: "New" } },
    ]);
    const plan = planMediaNoteFilenameCleanup(store.app, ["AnimeList/Anime"]);
    assert.equal(plan.items.length, 1);
    store.frontmatter.get(store.files[0])!.title = "Changed after review";

    const result = await applyMediaNoteFilenameCleanup(store.app, plan);
    assert.equal(result.renamed, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(store.renames, []);
  });

  it("treats an existing collision suffix as already safe instead of renaming repeatedly", () => {
    const store = filenameCleanupApp([
      { path: "AnimeList/Anime/Same.md", frontmatter: { media_type: "anime", title: "Same" } },
      { path: "AnimeList/Anime/Same (2).md", frontmatter: { media_type: "anime", title: "Same" } },
    ]);
    const plan = planMediaNoteFilenameCleanup(store.app, ["AnimeList/Anime"]);
    assert.equal(plan.scanned, 2);
    assert.deepEqual(plan.items, []);
  });
});

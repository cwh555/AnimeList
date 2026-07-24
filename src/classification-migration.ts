import { type Plugin } from "obsidian";
import {
  CLASSIFICATION_VERSION,
  classificationValues,
  migrateClassificationFrontmatter,
  sanitizeStoredClassification,
} from "./classification-compatibility";
import { getScopedMarkdownFiles } from "./vault-scope";

const MIGRATION_MARKER = Symbol.for("animelist.media-classification-migration");

export interface ClassificationMigrationSummary {
  scanned: number;
  changed: number;
  removed: number;
  moved: number;
}

export interface ClassificationMigrationHost extends Plugin {
  getScanFolders(): string[];
  refreshViews(): void;
  migrateMediaClassification?: () => Promise<ClassificationMigrationSummary>;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function needsMigration(frontmatter: Record<string, unknown>, basename: string): boolean {
  const clean = sanitizeStoredClassification(frontmatter, basename);
  const currentGenres = classificationValues(frontmatter.genres);
  const currentTags = classificationValues(frontmatter.media_tags);
  return !arraysEqual(currentGenres, clean.genres)
    || !arraysEqual(currentTags, clean.tags)
    || clean.removed.length > 0
    || clean.moved.length > 0
    || (frontmatter.media_tags == null && clean.tags.length > 0)
    || Number(frontmatter.classification_version ?? 0) > 0
      && Number(frontmatter.classification_version) < CLASSIFICATION_VERSION;
}

export async function migrateMediaClassification(
  plugin: ClassificationMigrationHost,
): Promise<ClassificationMigrationSummary> {
  const summary: ClassificationMigrationSummary = { scanned: 0, changed: 0, removed: 0, moved: 0 };
  const files = getScopedMarkdownFiles(plugin.app, plugin.getScanFolders());
  for (const file of files) {
    const cached = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!cached?.media_type) continue;
    summary.scanned += 1;
    if (!needsMigration(cached, file.basename)) continue;
    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const result = migrateClassificationFrontmatter(frontmatter, file.basename);
      summary.changed += 1;
      summary.removed += result.removed.length;
      summary.moved += result.moved.length;
    });
  }
  if (summary.changed) plugin.refreshViews();
  return summary;
}

export function installClassificationMigration(plugin: Plugin): void {
  const runtime = plugin as ClassificationMigrationHost;
  if (Reflect.get(runtime, MIGRATION_MARKER) === true) return;
  runtime.migrateMediaClassification = () => migrateMediaClassification(runtime);
  Object.defineProperty(runtime, MIGRATION_MARKER, { value: true });
}

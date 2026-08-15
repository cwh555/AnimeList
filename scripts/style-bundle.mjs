import path from "node:path";
import { readFile } from "node:fs/promises";

export const GENERATED_STYLE_START = "/* BEGIN GENERATED FEATURE STYLES */";
export const GENERATED_STYLE_END = "/* END GENERATED FEATURE STYLES */";

export const STYLE_SOURCES = Object.freeze([
  "styles/base.css",
  "styles.timeline.css",
  "styles.serial-reading.css",
  "styles.progress.css",
  "styles.note-detail.css",
  "styles.image-sections.css",
  "styles.moments.css",
  "styles.version-cleanup.css",
  "styles.masterpiece.css",
  "styles.score-dashboard.css",
  "styles.serial-cover.css",
  "styles.library-list.css",
  "styles.media-metadata.css",
  "styles.library-filters.css",
  "styles.user-tags.css",
  "styles.mobile.css",
  "styles.release-tracking.css",
]);

export function renderStyleBundle(sourceContents) {
  if (!Array.isArray(sourceContents) || sourceContents.length !== STYLE_SOURCES.length) {
    throw new Error(`Expected ${STYLE_SOURCES.length} stylesheet sources`);
  }
  const [base, ...features] = sourceContents;
  const cleanBase = String(base).trimEnd();
  const cleanFeatures = features.map((source) => String(source).trim()).filter(Boolean);
  return `${cleanBase}\n\n${GENERATED_STYLE_START}\n${cleanFeatures.join("\n\n")}\n${GENERATED_STYLE_END}\n`;
}

export async function buildStyleBundle(rootDirectory = process.cwd()) {
  const sourceContents = await Promise.all(
    STYLE_SOURCES.map((source) => readFile(path.join(rootDirectory, source), "utf8")),
  );
  return renderStyleBundle(sourceContents);
}

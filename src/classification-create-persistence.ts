import { TFile, type Plugin } from "obsidian";
import { automaticClassificationForResult, writeClassificationSelection } from "./classification-compatibility";
import { resolveClassifiedMediaResult } from "./classification-resolution";
import type { ExternalMediaResult, MediaNoteForm, MediaType } from "./types";

const PERSISTENCE_MARKER = Symbol.for("animelist.classification-create-persistence-v2");

interface ClassificationPersistenceHost extends Plugin {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
}

export function applyResolvedMediaMetadata(
  frontmatter: Record<string, unknown>,
  result: ExternalMediaResult,
): void {
  writeClassificationSelection(frontmatter, automaticClassificationForResult(result));
  if (result.year !== "" && result.year != null) frontmatter.year = result.year;
  if (result.season !== "" && result.season != null) frontmatter.season = result.season;
  else delete frontmatter.season;
}

export async function resolveMediaForCreate(
  host: Pick<ClassificationPersistenceHost, "searchAniList">,
  result: ExternalMediaResult,
): Promise<ExternalMediaResult> {
  return resolveClassifiedMediaResult(host, result);
}

export function installClassificationCreatePersistence(plugin: Plugin): void {
  const runtime = plugin as ClassificationPersistenceHost;
  if (Reflect.get(runtime, PERSISTENCE_MARKER) === true) return;
  const original = runtime.createMediaNote.bind(runtime);
  runtime.createMediaNote = async (selected, form) => {
    const resolved = await resolveMediaForCreate(runtime, selected);
    const automatic = automaticClassificationForResult(resolved);
    const file = await original(resolved, {
      ...form,
      genres: automatic.genres,
      tags: automatic.tags,
    });
    await runtime.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyResolvedMediaMetadata(frontmatter, resolved);
    });
    return file;
  };
  Object.defineProperty(runtime, PERSISTENCE_MARKER, { value: true });
}

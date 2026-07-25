import { createClassificationSelection, type ClassificationSelection } from "./media-classification";
import type { ExternalMediaResult } from "./types";

const CREATE_DRAFTS = new Map<string, ClassificationSelection>();

function normalizeKeyPart(value: unknown): string {
  const text = typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
      ? String(value)
      : "";
  return text.normalize("NFKC").trim().toLocaleLowerCase();
}

export function classificationCreateDraftKey(result: ExternalMediaResult): string {
  const sourceId = normalizeKeyPart(result.sourceId);
  if (sourceId) {
    return [normalizeKeyPart(result.provider), normalizeKeyPart(result.mediaType), sourceId].join(":");
  }
  return [
    normalizeKeyPart(result.provider),
    normalizeKeyPart(result.mediaType),
    normalizeKeyPart(result.format),
    normalizeKeyPart(result.originalTitle || result.romajiTitle || result.title),
    normalizeKeyPart(result.year),
  ].join(":");
}

function cloneSelection(selection: ClassificationSelection): ClassificationSelection {
  return {
    genres: [...selection.genres],
    tags: [...selection.tags],
  };
}

export function setClassificationCreateDraft(
  result: ExternalMediaResult,
  selection: ClassificationSelection,
): ClassificationSelection {
  const normalized = createClassificationSelection(selection.genres, selection.tags);
  CREATE_DRAFTS.set(classificationCreateDraftKey(result), normalized);
  return cloneSelection(normalized);
}

export function getClassificationCreateDraft(
  result: ExternalMediaResult,
): ClassificationSelection | null {
  const selection = CREATE_DRAFTS.get(classificationCreateDraftKey(result));
  return selection ? cloneSelection(selection) : null;
}

export function takeClassificationCreateDraft(
  result: ExternalMediaResult,
): ClassificationSelection | null {
  const key = classificationCreateDraftKey(result);
  const selection = CREATE_DRAFTS.get(key);
  CREATE_DRAFTS.delete(key);
  return selection ? cloneSelection(selection) : null;
}

export function clearClassificationCreateDraft(result: ExternalMediaResult): void {
  CREATE_DRAFTS.delete(classificationCreateDraftKey(result));
}

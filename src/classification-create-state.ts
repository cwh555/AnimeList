import { createClassificationSelection, type ClassificationSelection } from "./media-classification";
import type { ExternalMediaResult } from "./types";

const CREATE_DRAFTS = new WeakMap<ExternalMediaResult, ClassificationSelection>();

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
  CREATE_DRAFTS.set(result, normalized);
  return cloneSelection(normalized);
}

export function getClassificationCreateDraft(
  result: ExternalMediaResult,
): ClassificationSelection | null {
  const selection = CREATE_DRAFTS.get(result);
  return selection ? cloneSelection(selection) : null;
}

export function clearClassificationCreateDraft(result: ExternalMediaResult): void {
  CREATE_DRAFTS.delete(result);
}

export { AnimeListUI } from "../ui/library-renderer";
export { TimelineUI } from "../ui/timeline-renderer";
export { AddMediaModal, ConfirmDeleteModal, EditMediaModal } from "../ui/media-modals";
export { TimelineModal } from "../ui/timeline-modal";
export { AnimeListRenderChild, DetailActionsRenderChild } from "../ui/markdown-renderers";

import { dedupeSearchResults, normalizeAniListMedia, normalizeBangumiSubject, normalizeOpenLibraryBook } from "../data/provider-normalizers";
import { applyTemplateVariables, buildMediaMarkdown, completedProgress, ensureDetailBlock } from "../data/media-note-codec";
import { normalizeGenres } from "../domain/media-metadata";
import { formatFileModifiedTime, sanitizePathPart } from "../domain/value-normalization";
import { AnimeListUI } from "../ui/library-renderer";
import { normalizeDateParts } from "../ui/media-form-controls";
import { TimelineUI, assignTimelineLanes, compareTimelineEntries, filterTimelineEntries } from "../ui/timeline-renderer";

export const legacyTest = {
  normalizeBangumiSubject, normalizeAniListMedia, normalizeOpenLibraryBook, dedupeSearchResults,
  buildMediaMarkdown, sanitizePathPart, normalizeGenres, completedProgress, applyTemplateVariables,
  formatFileModifiedTime, ensureDetailBlock, AnimeListUI, TimelineUI, assignTimelineLanes,
  filterTimelineEntries, compareTimelineEntries, normalizeDateParts,
};

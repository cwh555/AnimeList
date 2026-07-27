/**
 * Thin compatibility barrel retained for downstream imports and characterization
 * tests. Runtime lifecycle, forms, renderers, and feature composition live in
 * explicit app/compat modules; no production behavior is implemented here.
 */
import {
  dedupeSearchResults,
  normalizeAniListMedia,
  normalizeBangumiSubject,
  normalizeOpenLibraryBook,
} from "./data/provider-normalizers";
import {
  applyTemplateVariables,
  buildMediaMarkdown,
  completedProgress,
  ensureDetailBlock,
} from "./data/media-note-codec";
import { normalizeGenres } from "./domain/media-metadata";
import {
  formatFileModifiedTime,
  sanitizePathPart,
} from "./domain/value-normalization";
import { AnimeListUI } from "./compat/library-ui";
import {
  TimelineUI,
  assignTimelineLanes,
  compareTimelineEntries,
  filterTimelineEntries,
} from "./compat/timeline-ui";
import { normalizeDateParts } from "./compat/media-modals";

export { AnimeListUI } from "./compat/library-ui";
export { TimelineModal, TimelineUI } from "./compat/timeline-ui";
export { AddMediaModal, ConfirmDeleteModal, EditMediaModal } from "./compat/media-modals";
export { AnimeListRenderChild, DetailActionsRenderChild } from "./compat/markdown-renderers";

export const legacyTest = {
  normalizeBangumiSubject,
  normalizeAniListMedia,
  normalizeOpenLibraryBook,
  dedupeSearchResults,
  buildMediaMarkdown,
  sanitizePathPart,
  normalizeGenres,
  completedProgress,
  applyTemplateVariables,
  formatFileModifiedTime,
  ensureDetailBlock,
  AnimeListUI,
  TimelineUI,
  assignTimelineLanes,
  filterTimelineEntries,
  compareTimelineEntries,
  normalizeDateParts,
};

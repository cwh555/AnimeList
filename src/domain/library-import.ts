import type { MediaType } from "./media-types";
import {
  ANIMELIST_LIBRARY_EXPORT_FORMAT,
  ANIMELIST_LIBRARY_EXPORT_VERSION,
  isLibraryExportDocumentV1,
  type LibraryExportDocumentV1,
  type LibraryExportRecordV1,
} from "./library-export";

export type LibraryImportErrorCode =
  | "invalid-json"
  | "wrong-format"
  | "unsupported-version"
  | "invalid-document";

export class LibraryImportError extends Error {
  constructor(
    readonly code: LibraryImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LibraryImportError";
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseLibraryImportJson(content: string): LibraryExportDocumentV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LibraryImportError("invalid-json", "Library import file is not valid JSON.");
  }

  const root = objectValue(parsed);
  if (!root) throw new LibraryImportError("invalid-document", "Library import root must be an object.");
  if (root.format !== ANIMELIST_LIBRARY_EXPORT_FORMAT) {
    throw new LibraryImportError("wrong-format", "File is not an AnimeList Library export.");
  }
  if (root.version !== ANIMELIST_LIBRARY_EXPORT_VERSION) {
    throw new LibraryImportError(
      "unsupported-version",
      `Unsupported AnimeList Library export version: ${typeof root.version === "number" || typeof root.version === "string" ? root.version : "missing"}.`,
    );
  }
  if (!isLibraryExportDocumentV1(root)) {
    throw new LibraryImportError("invalid-document", "AnimeList Library export data is malformed.");
  }
  return root;
}

export type LibraryImportMatchCandidate =
  | { kind: "source"; provider: string; id: string }
  | { kind: "anilist"; id: string }
  | { kind: "title"; mediaType: MediaType; title: string };

export function libraryImportMatchCandidates(record: LibraryExportRecordV1): LibraryImportMatchCandidate[] {
  const candidates: LibraryImportMatchCandidate[] = [];
  const provider = record.source?.provider?.trim().toLocaleLowerCase() ?? "";
  const sourceId = record.source?.id?.trim() ?? "";
  if (provider && sourceId) candidates.push({ kind: "source", provider, id: sourceId });

  const anilistId = record.source?.anilistId?.trim() ?? "";
  if (anilistId) candidates.push({ kind: "anilist", id: anilistId });

  const title = record.title.trim();
  if (title) candidates.push({ kind: "title", mediaType: record.mediaType, title });
  return candidates;
}

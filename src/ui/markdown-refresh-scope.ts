import { isLibraryRelevantPath } from "../data/library-change-scope";

function refreshRoots(source: string | undefined, scanRoots: readonly string[]): readonly string[] {
  const scoped = String(source ?? "").trim();
  return scoped ? [scoped] : scanRoots;
}

export function shouldRefreshAnimeListBlockPath(
  path: string,
  source: string | undefined,
  scanRoots: readonly string[],
  coverFolder: string,
): boolean {
  return isLibraryRelevantPath(path, refreshRoots(source, scanRoots), coverFolder);
}

export function shouldRefreshAnimeListBlockRename(
  oldPath: string,
  newPath: string,
  source: string | undefined,
  scanRoots: readonly string[],
  coverFolder: string,
): boolean {
  return shouldRefreshAnimeListBlockPath(oldPath, source, scanRoots, coverFolder)
    || shouldRefreshAnimeListBlockPath(newPath, source, scanRoots, coverFolder);
}

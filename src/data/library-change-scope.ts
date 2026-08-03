function cleanPath(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export function pathBelongsToLibraryRoot(path: string, root: string): boolean {
  const candidate = cleanPath(path);
  const scope = cleanPath(root);
  if (!candidate) return false;
  if (!scope) return !candidate.includes("/");
  return candidate === scope || candidate.startsWith(`${scope}/`);
}

export function isLibraryRelevantPath(
  path: string,
  scanRoots: readonly string[],
  coverFolder: string,
): boolean {
  return scanRoots.some((root) => pathBelongsToLibraryRoot(path, root))
    || pathBelongsToLibraryRoot(path, coverFolder);
}

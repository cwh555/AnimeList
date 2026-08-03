export const LIBRARY_DISCOVERY_VERSION = 1;

export interface MediaDiscoveryCandidate {
  path: string;
  frontmatter: unknown;
}

function normalizeVaultPath(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isAnimeListMediaFrontmatter(value: unknown): boolean {
  const frontmatter = record(value);
  return frontmatter !== null
    && (frontmatter.media_type === "anime"
      || frontmatter.media_type === "manga"
      || frontmatter.media_type === "novel");
}

function parentPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? "" : normalized.slice(0, slash);
}

export function suggestedMediaRoot(path: string): string {
  const parent = parentPath(path);
  if (!parent) return "/";
  const segments = parent.split("/");
  const leaf = segments.at(-1)?.toLocaleLowerCase() ?? "";
  if ((leaf === "anime" || leaf === "manga" || leaf === "novel") && segments.length > 1) {
    return segments.slice(0, -1).join("/");
  }
  return parent;
}

function scanRootPath(value: string): string {
  const raw = String(value ?? "").trim();
  return raw === "/" ? "" : normalizeVaultPath(raw);
}

function rootCoversFile(root: string, filePath: string): boolean {
  const normalizedRoot = scanRootPath(root);
  const normalizedFile = normalizeVaultPath(filePath);
  if (!normalizedRoot) return !normalizedFile.includes("/");
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`);
}

function rootCoversRoot(parent: string, child: string): boolean {
  const normalizedParent = scanRootPath(parent);
  const normalizedChild = scanRootPath(child);
  if (!normalizedParent) return !normalizedChild.includes("/");
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

export function discoverExistingMediaRoots(
  candidates: Iterable<MediaDiscoveryCandidate>,
  configuredRoots: readonly string[],
): string[] {
  const discovered: string[] = [];
  for (const candidate of candidates) {
    if (!isAnimeListMediaFrontmatter(candidate.frontmatter)) continue;
    if (configuredRoots.some((root) => rootCoversFile(root, candidate.path))) continue;
    const root = suggestedMediaRoot(candidate.path);
    if (configuredRoots.some((configured) => rootCoversRoot(configured, root))) continue;
    if (discovered.some((existing) => rootCoversRoot(existing, root))) continue;
    for (let index = discovered.length - 1; index >= 0; index -= 1) {
      if (rootCoversRoot(root, discovered[index])) discovered.splice(index, 1);
    }
    discovered.push(root);
  }
  return discovered.sort((left, right) => left.localeCompare(right));
}

import { normalizePath, type DataAdapter } from "obsidian";

export type AnimeListInternalTrashBucket = "image-order" | "thumbnail-cache";

type RenamingDataAdapter = DataAdapter & { rename(sourcePath: string, targetPath: string): Promise<void> };

function supportsRename(adapter: DataAdapter): adapter is RenamingDataAdapter {
  return "rename" in adapter && typeof adapter.rename === "function";
}

async function ensureAdapterDirectory(adapter: DataAdapter, path: string): Promise<void> {
  const clean = normalizePath(path).replace(/^\/+|\/+$/g, "");
  if (!clean) return;
  let current = "";
  for (const part of clean.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!await adapter.exists(current)) await adapter.mkdir(current);
  }
}

function splitName(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, dot), extension: name.slice(dot) };
}

/**
 * Moves adapter-only AnimeList internals to the vault-local trash instead of
 * permanently deleting them. User-facing vault files should use
 * app.fileManager.trashFile() so Obsidian can honor the user's trash setting.
 */
export async function moveAdapterFileToVaultTrash(
  adapter: DataAdapter,
  sourcePath: string,
  bucket: AnimeListInternalTrashBucket,
): Promise<string | null> {
  const source = normalizePath(sourcePath).replace(/^\/+/, "");
  if (!source || !await adapter.exists(source) || !supportsRename(adapter)) return null;

  const root = normalizePath(`.trash/AnimeList/Internal/${bucket}`);
  await ensureAdapterDirectory(adapter, root);

  const name = source.split("/").pop() ?? "file";
  const { stem, extension } = splitName(name);
  let target = normalizePath(`${root}/${name}`);
  let suffix = 2;
  while (await adapter.exists(target)) {
    target = normalizePath(`${root}/${stem}-${suffix}${extension}`);
    suffix += 1;
  }

  await adapter.rename(source, target);
  return target;
}

import { normalizePath, type TAbstractFile, type Vault } from "obsidian";
import { sanitizePathPart } from "../domain/value-normalization";

export interface UniqueVaultFilePathOptions {
  ignorePath?: string;
  reservedPaths?: ReadonlySet<string>;
}

type VaultPathLookup = Pick<Vault, "getAbstractFileByPath">;

function normalizedPath(value: string): string {
  return normalizePath(value).replace(/^\/+|\/+$/g, "");
}

function isOccupied(
  vault: VaultPathLookup,
  path: string,
  options: UniqueVaultFilePathOptions,
): boolean {
  if (options.reservedPaths?.has(path)) return true;
  const existing: TAbstractFile | null = vault.getAbstractFileByPath(path);
  if (!existing) return false;
  const ignored = options.ignorePath ? normalizedPath(options.ignorePath) : "";
  return !ignored || normalizedPath(existing.path) !== ignored;
}

export function uniqueVaultFilePath(
  vault: VaultPathLookup,
  folder: string,
  baseName: string,
  extension: string,
  options: UniqueVaultFilePathOptions = {},
): string {
  const cleanFolder = normalizedPath(folder);
  const cleanName = sanitizePathPart(baseName);
  const cleanExtension = String(extension ?? "").replace(/^\.+/, "");
  const candidatePath = (suffix = "") => normalizePath(
    cleanFolder
      ? `${cleanFolder}/${cleanName}${suffix}.${cleanExtension}`
      : `${cleanName}${suffix}.${cleanExtension}`,
  );

  let candidate = candidatePath();
  let index = 2;
  while (isOccupied(vault, candidate, options)) {
    candidate = candidatePath(` (${index})`);
    index += 1;
  }
  return candidate;
}

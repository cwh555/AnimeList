import { TFile, type App } from "obsidian";
import { allImageSectionPaths, normalizeImageSectionPath } from "../../domain/image-section";
import { CharacterLibraryService } from "../character-library-service";

/**
 * Both the Markdown Image Section and the Characters-wide gallery delegate here.
 * Only a picture already referenced by this character's Image Sections may become
 * its cover. Media notes continue to use the standard `cover` frontmatter field.
 */
export async function setCharacterGalleryCover(
  app: App, libraryRoot: string, sourcePath: string, imagePath: string,
): Promise<boolean> {
  const folder = libraryRoot.replace(/\/+$/, "") + "/Characters/";
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile) || !sourcePath.startsWith(folder)) return false;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (fm?.animelist_character !== true) return false;
  const image = normalizeImageSectionPath(imagePath);
  if (!image) throw new Error("Image path is empty");
  const markdown = await app.vault.cachedRead(file);
  if (!allImageSectionPaths(markdown).includes(image)) {
    throw new Error("This picture is not in the character's image gallery");
  }
  await new CharacterLibraryService(app, () => libraryRoot).setPortrait(sourcePath, image);
  return true;
}

export function isCharacterGallerySource(app: App, libraryRoot: string, sourcePath: string): boolean {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  return file instanceof TFile
    && sourcePath.startsWith(libraryRoot.replace(/\/+$/, "") + "/Characters/")
    && app.metadataCache.getFileCache(file)?.frontmatter?.animelist_character === true;
}

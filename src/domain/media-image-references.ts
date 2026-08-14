import { allImageSectionPaths } from "./image-section";
import { allMomentImagePaths } from "./moments";

export function allManagedImageReferences(markdown: unknown): string[] {
  const unique = new Set<string>();
  for (const path of allImageSectionPaths(markdown)) unique.add(path);
  for (const path of allMomentImagePaths(markdown)) unique.add(path);
  return [...unique];
}

import { normalizeUserTag, normalizeUserTags } from "./user-tags";

function tagKey(value: string): string {
  return value.toLocaleLowerCase();
}

export function normalizeUserTagCatalog(values: unknown): string[] {
  return normalizeUserTags(values, 256);
}

export function mergeUserTagCatalog(catalog: unknown, values: unknown): string[] {
  return normalizeUserTagCatalog([
    ...normalizeUserTagCatalog(catalog),
    ...normalizeUserTagCatalog(values),
  ]);
}

export function addUserTagToCatalog(catalog: unknown, value: unknown): string[] {
  const tag = normalizeUserTag(value);
  return tag ? mergeUserTagCatalog(catalog, [tag]) : normalizeUserTagCatalog(catalog);
}

export function renameUserTagInCatalog(catalog: unknown, current: unknown, next: unknown): string[] {
  const source = normalizeUserTag(current);
  const replacement = normalizeUserTag(next);
  const normalized = normalizeUserTagCatalog(catalog);
  if (!source || !replacement) return normalized;

  const sourceKey = tagKey(source);
  const replacementKey = tagKey(replacement);
  const sourceIndex = normalized.findIndex((tag) => tagKey(tag) === sourceKey);
  if (sourceIndex < 0) return normalized;

  if (sourceKey === replacementKey) {
    const output = [...normalized];
    output[sourceIndex] = replacement;
    return normalizeUserTagCatalog(output);
  }

  const targetIndex = normalized.findIndex((tag) => tagKey(tag) === replacementKey);
  if (targetIndex >= 0) {
    return normalized.filter((_, index) => index !== sourceIndex);
  }

  const output = [...normalized];
  output[sourceIndex] = replacement;
  return normalizeUserTagCatalog(output);
}

export function removeUserTagFromCatalog(catalog: unknown, value: unknown): string[] {
  const tag = normalizeUserTag(value);
  if (!tag) return normalizeUserTagCatalog(catalog);
  const key = tagKey(tag);
  return normalizeUserTagCatalog(catalog).filter((entry) => tagKey(entry) !== key);
}

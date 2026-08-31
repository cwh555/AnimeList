import { allManagedImageReferences } from "./media-image-references";
import { normalizeMediaAssetPath } from "./media-asset-cleanup";

function cleanYamlScalar(value: string): string {
  let result = value.trim();
  if (!result) return "";
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1);
  } else {
    result = result.replace(/\s+#.*$/, "").trim();
  }
  return result.replace(/^!?\[\[/, "").replace(/\]\]$/, "").split("|")[0]?.trim() ?? "";
}

function markdownTarget(value: string): string {
  let result = value.trim();
  if (result.startsWith("<") && result.endsWith(">")) result = result.slice(1, -1);
  else {
    const title = /^(.*?)(?:\s+["'][^"']*["'])$/.exec(result);
    if (title) result = title[1]?.trim() ?? result;
  }
  try { result = decodeURIComponent(result); } catch { /* keep original */ }
  return result.split("#")[0]?.trim() ?? "";
}

export function extractMarkdownAssetTargets(markdown: unknown): string[] {
  const text = typeof markdown === "string" ? markdown : "";
  const targets = new Set<string>();
  const add = (value: string): void => {
    const normalized = value.trim();
    if (!normalized || /^(?:https?:|data:|app:)/i.test(normalized)) return;
    targets.add(normalized);
  };

  for (const path of allManagedImageReferences(text)) add(path);

  const coverPattern = /^\s*cover\s*:\s*(.+?)\s*$/gim;
  for (const match of text.matchAll(coverPattern)) add(cleanYamlScalar(match[1] ?? ""));

  const wikiPattern = /!?\[\[([^\]]+)\]\]/g;
  for (const match of text.matchAll(wikiPattern)) add((match[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "");

  const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) add(markdownTarget(match[1] ?? ""));

  return [...targets];
}

export function extractFrontmatterCoverTargets(frontmatter: Record<string, unknown> | undefined): string[] {
  if (!frontmatter) return [];
  const targets = new Set<string>();
  const visit = (value: unknown, key = ""): void => {
    if (key === "cover" && typeof value === "string") {
      const clean = cleanYamlScalar(value);
      if (clean && !/^(?:https?:|data:|app:)/i.test(clean)) targets.add(clean);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      visit(childValue, childKey);
    }
  };
  visit(frontmatter);
  return [...targets].map(normalizeMediaAssetPath).filter(Boolean);
}

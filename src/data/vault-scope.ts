import { App, TAbstractFile, TFile, normalizePath } from "obsidian";

function appendMarkdownFile(entry: TAbstractFile, output: TFile[], seen: Set<string>): void {
  if (entry instanceof TFile && entry.extension === "md" && !seen.has(entry.path)) {
    seen.add(entry.path);
    output.push(entry);
  }
}

function hasChildren(entry: TAbstractFile): entry is TAbstractFile & { children: TAbstractFile[] } {
  return "children" in entry && Array.isArray(entry.children);
}

function collectMarkdownFiles(entry: TAbstractFile, output: TFile[], seen: Set<string>): void {
  if (entry instanceof TFile) {
    appendMarkdownFile(entry, output, seen);
    return;
  }

  if (hasChildren(entry)) {
    for (const child of entry.children) collectMarkdownFiles(child, output, seen);
  }
}

/**
 * Collect Markdown files only below configured vault-relative roots.
 * An empty root means direct children of the vault root, matching flat mode
 * without recursively inspecting unrelated folders.
 */
export function getScopedMarkdownFiles(app: App, roots: string[]): TFile[] {
  const output: TFile[] = [];
  const seen = new Set<string>();

  for (const rawRoot of roots) {
    const root = normalizePath(String(rawRoot ?? "")).replace(/^\/+|\/+$/g, "");
    if (!root) {
      const vaultRoot = app.vault.getRoot();
      for (const child of vaultRoot.children) appendMarkdownFile(child, output, seen);
      continue;
    }

    const entry = app.vault.getAbstractFileByPath(root);
    if (entry) collectMarkdownFiles(entry, output, seen);
  }

  return output;
}


/** Collect every Markdown file by traversing the vault tree. */
export function getAllMarkdownFiles(app: App): TFile[] {
  const output: TFile[] = [];
  const seen = new Set<string>();
  collectMarkdownFiles(app.vault.getRoot(), output, seen);
  return output;
}

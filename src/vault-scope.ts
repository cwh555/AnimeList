import { App, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";

function appendMarkdownFile(entry: TAbstractFile, output: TFile[], seen: Set<string>): void {
  if (entry instanceof TFile && entry.extension === "md" && !seen.has(entry.path)) {
    seen.add(entry.path);
    output.push(entry);
  }
}

function collectMarkdownFiles(entry: TAbstractFile, output: TFile[], seen: Set<string>): void {
  if (entry instanceof TFile) {
    appendMarkdownFile(entry, output, seen);
    return;
  }

  if (entry instanceof TFolder) {
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

import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import {
  applyMediaNoteFilenameCleanup,
  planMediaNoteFilenameCleanup,
  type MediaNoteFilenameCleanupPlan,
} from "../data/media-note-filename-cleanup";

function appendRule(parent: HTMLElement, text: string): void {
  parent.createEl("li", { text });
}

export class MediaNoteFilenameCleanupModal extends Modal {
  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-version-cleanup-modal");
    this.titleEl.setText("Sync note filenames with titles");
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: "Older AnimeList versions could leave a note filename unchanged after its title was edited. Review the proposed renames before applying them.",
    });
    const rules = this.contentEl.createEl("ul", { cls: "al-version-cleanup-rules" });
    appendRule(rules, "Only AnimeList media notes in your configured Library folders are scanned.");
    appendRule(rules, "Each note stays in its current folder; only the Markdown filename can change.");
    appendRule(rules, "The filename is derived from the note's existing title frontmatter using the same safe naming rules as newly created notes.");
    appendRule(rules, "If another file already uses the desired name, AnimeList keeps both and uses a suffix such as ‘ (2)’.");
    appendRule(rules, "Note content and frontmatter are not rewritten. Obsidian's file rename API is used so link updates follow your Obsidian settings.");
    appendRule(rules, "Every reviewed item is rechecked immediately before rename; changed or conflicting items are skipped.");

    const status = this.contentEl.createEl("p", { cls: "al-version-cleanup-status", text: "Scanning media notes…" });
    const list = this.contentEl.createDiv({ cls: "al-version-cleanup-list" });
    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = footer.createEl("button", { cls: "mod-cta", text: "Confirm renames" });
    confirm.type = "button";
    confirm.disabled = true;

    let plan: MediaNoteFilenameCleanupPlan | null = null;
    try {
      plan = planMediaNoteFilenameCleanup(this.host.app, this.host.getScanFolders());
      status.setText(`Scanned ${plan.scanned} AnimeList media notes. ${plan.items.length} note(s) can be renamed.`);
      if (!plan.items.length) {
        list.createDiv({ cls: "al-search-empty", text: "All scanned note filenames already match their titles or safe collision names." });
      } else {
        for (const item of plan.items) {
          const row = list.createDiv({ cls: "al-version-cleanup-item" });
          row.createEl("strong", { text: item.title });
          row.createDiv({ cls: "al-result-meta", text: item.path });
          row.createEl("code", { text: `→ ${item.targetPath}` });
        }
        confirm.disabled = false;
      }
    } catch (error) {
      console.error("AnimeList note filename scan failed", error);
      status.setText(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    confirm.addEventListener("click", () => {
      if (!plan || !plan.items.length) return;
      confirm.disabled = true;
      cancel.disabled = true;
      status.setText("Applying reviewed note renames…");
      void applyMediaNoteFilenameCleanup(this.host.app, plan).then((result) => {
        status.setText(`Renamed ${result.renamed}; skipped ${result.skipped}; failed ${result.failed}.`);
        list.empty();
        for (const detail of result.details) {
          const row = list.createDiv({ cls: `al-version-cleanup-item is-${detail.status}` });
          row.createEl("strong", { text: detail.title });
          row.createDiv({ cls: "al-result-meta", text: `${detail.path} → ${detail.targetPath} · ${detail.status}` });
          row.createEl("p", { text: detail.message });
        }
        cancel.setText("Close");
        cancel.disabled = false;
        if (result.renamed > 0) this.host.refreshViews();
        new Notice(`AnimeList renamed ${result.renamed} note(s).`);
      }).catch((error) => {
        console.error("AnimeList note filename cleanup failed", error);
        status.setText(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
        cancel.disabled = false;
        confirm.disabled = false;
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

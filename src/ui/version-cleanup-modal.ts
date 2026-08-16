import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import {
  applyDuplicateDefaultCoverCleanup,
  planDuplicateDefaultCoverCleanup,
  type VersionCleanupPlan,
} from "../data/version-cleanup-service";

function appendRule(parent: HTMLElement, text: string): void {
  parent.createEl("li", { text });
}

export class DuplicateCoverCleanupModal extends Modal {
  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-version-cleanup-modal");
    this.titleEl.setText("Remove duplicate note covers");
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: "Review the exact notes that can be safely updated. Nothing is written until you confirm.",
    });
    const rules = this.contentEl.createEl("ul", { cls: "al-version-cleanup-rules" });
    appendRule(rules, "Only AnimeList media notes are scanned.");
    appendRule(rules, "Only the old standalone ![[cover|260]] line immediately after animelist-detail is removed.");
    appendRule(rules, "The embedded path must exactly match the note's current cover frontmatter.");
    appendRule(rules, "Notes using a custom note_template are skipped.");
    appendRule(rules, "Frontmatter, image sections, other images, headings, and prose are not changed.");

    const status = this.contentEl.createEl("p", { cls: "al-version-cleanup-status", text: "Scanning media notes…" });
    const list = this.contentEl.createDiv({ cls: "al-version-cleanup-list" });
    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = footer.createEl("button", { cls: "mod-cta", text: "Confirm cleanup" });
    confirm.type = "button";
    confirm.disabled = true;

    let plan: VersionCleanupPlan | null = null;
    void planDuplicateDefaultCoverCleanup(this.host.app, this.host.getScanFolders()).then((value) => {
      plan = value;
      list.empty();
      status.setText(`Scanned ${value.scanned} media notes. ${value.items.length} note(s) can be updated.`);
      if (!value.items.length) {
        list.createDiv({ cls: "al-search-empty", text: "No safe duplicate default covers were found." });
        confirm.disabled = true;
        return;
      }
      for (const item of value.items) {
        const row = list.createDiv({ cls: "al-version-cleanup-item" });
        row.createEl("strong", { text: item.title });
        row.createDiv({ cls: "al-result-meta", text: item.path });
        row.createEl("code", { text: `Line ${item.lineNumber}: ${item.lineText.trim()}` });
      }
      confirm.disabled = false;
    }).catch((error) => {
      console.error("AnimeList version cleanup scan failed", error);
      status.setText(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    confirm.addEventListener("click", () => {
      if (!plan || !plan.items.length) return;
      confirm.disabled = true;
      cancel.disabled = true;
      status.setText("Applying reviewed cleanup…");
      void applyDuplicateDefaultCoverCleanup(this.host.app, plan).then((result) => {
        status.setText(`Updated ${result.updated}; skipped ${result.skipped}; failed ${result.failed}.`);
        list.empty();
        for (const detail of result.details) {
          const row = list.createDiv({ cls: `al-version-cleanup-item is-${detail.status}` });
          row.createEl("strong", { text: detail.title });
          row.createDiv({ cls: "al-result-meta", text: `${detail.path} · ${detail.status}` });
          row.createEl("p", { text: detail.message });
        }
        cancel.setText("Close");
        cancel.disabled = false;
        if (result.updated > 0) this.host.refreshViews();
        new Notice(`AnimeList cleanup updated ${result.updated} note(s).`);
      }).catch((error) => {
        console.error("AnimeList version cleanup failed", error);
        status.setText(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        cancel.disabled = false;
        confirm.disabled = false;
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

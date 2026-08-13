import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "./app/feature-types";
import { cleanupLegacyMetadataNotes } from "./data/legacy-metadata-cleanup";
import type {
  LegacyMetadataCleanupDetail,
  LegacyMetadataCleanupProgress,
  LegacyMetadataCleanupResult,
} from "./domain/legacy-metadata-types";
import { legacyMetadataText } from "./legacy-metadata-text";

function phaseLabel(phase: LegacyMetadataCleanupProgress["phase"]): string {
  return legacyMetadataText(`settings.phase.${phase}` as const);
}

function summaryText(summary: LegacyMetadataCleanupResult): string {
  return legacyMetadataText("settings.done", {
    scanned: summary.scanned,
    cleaned: summary.cleaned,
    enriched: summary.enriched,
    unavailable: summary.unavailable,
    failed: summary.failed,
  });
}

function resultStatus(detail: LegacyMetadataCleanupDetail): string {
  if (detail.enrichment === "failed") return legacyMetadataText("settings.result.failed");
  if (detail.enrichment === "unavailable") return legacyMetadataText("settings.result.unmatched");
  return legacyMetadataText("settings.result.updated");
}

function appendMetric(parent: HTMLElement, label: string, value: number): void {
  const metric = parent.createDiv({ cls: "al-stat" });
  metric.createEl("strong", { cls: "al-stat-number", text: String(value) });
  metric.createSpan({ cls: "al-stat-label", text: label });
}

function appendResult(parent: HTMLElement, detail: LegacyMetadataCleanupDetail): void {
  const item = parent.createDiv({ cls: "al-source-note" });
  const header = item.createDiv({ cls: "al-result-head" });
  const identity = header.createDiv();
  identity.createEl("strong", { cls: "al-result-title", text: detail.title });
  identity.createDiv({ cls: "al-result-meta", text: detail.path });
  header.createSpan({ cls: "al-result-meta", text: resultStatus(detail) });

  if (detail.changes.length) {
    const changed = item.createEl("p", { cls: "al-result-meta" });
    changed.append(`${legacyMetadataText("settings.result.changed")}: `);
    detail.changes.forEach((field, index) => {
      if (index > 0) changed.append(" ");
      changed.createEl("code", { text: field });
    });
  }
  if (detail.enrichment === "unavailable") {
    item.createEl("p", {
      cls: "al-modal-hint",
      text: legacyMetadataText("settings.result.unmatchedDetail"),
    });
  }
  if (detail.enrichment === "failed") {
    item.createEl("p", {
      cls: "al-modal-warning",
      text: detail.error
        ? legacyMetadataText("settings.result.failedDetail", { error: detail.error })
        : legacyMetadataText("settings.result.failedNoDetail"),
    });
  }
}

function setProgress(fill: HTMLElement, completed: number, total: number): number {
  const ratio = total > 0 ? Math.round((completed / total) * 100) : 0;
  const percent = Math.min(100, Math.max(0, ratio));
  fill.setCssStyles({ width: `${percent}%` });
  return percent;
}

export class LegacyMetadataCleanupModal extends Modal {
  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-legacy-metadata-cleanup-modal");
    this.titleEl.setText(legacyMetadataText("settings.modalTitle"));
    this.renderConfirmation();
  }

  private renderConfirmation(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: "Review this legacy metadata update before the plugin writes any notes.",
    });
    const rules = this.contentEl.createEl("ul", { cls: "al-version-cleanup-rules" });
    rules.createEl("li", { text: "Scan media notes in the configured library folders." });
    rules.createEl("li", { text: "Normalize legacy genre, studio, tag, season, and classification metadata." });
    rules.createEl("li", { text: "When required, query current provider metadata to repair incomplete legacy fields." });
    rules.createEl("li", { text: "Preserve unrelated frontmatter and note body content." });
    rules.createEl("li", { text: "This operation can modify many notes; Cancel makes no changes." });

    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = footer.createEl("button", { cls: "mod-cta", text: "Confirm and run" });
    confirm.type = "button";
    confirm.addEventListener("click", () => this.runCleanup());
  }

  private runCleanup(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: legacyMetadataText("settings.modalDescription"),
    });

    const progressCard = this.contentEl.createDiv({ cls: "al-source-note" });
    const progressHeader = progressCard.createDiv({ cls: "al-result-head" });
    const phase = progressHeader.createEl("strong", {
      cls: "al-result-title",
      text: legacyMetadataText("settings.phase.scanning"),
    });
    const count = progressHeader.createSpan({
      cls: "al-result-meta",
      text: legacyMetadataText("settings.progress", { completed: 0, total: 0 }),
    });
    const message = progressCard.createEl("p", { text: legacyMetadataText("settings.preparing") });
    const progressTrack = progressCard.createDiv({ cls: "al-progress-track" });
    const progressFill = progressTrack.createDiv({ cls: "al-progress-fill" });
    setProgress(progressFill, 0, 1);
    const progressMeta = progressCard.createDiv({ cls: "al-progress-row" });
    const current = progressMeta.createSpan({ text: legacyMetadataText("settings.progressWaiting") });
    const percent = progressMeta.createSpan({ text: "0%" });

    const completion = this.contentEl.createDiv();
    completion.hidden = true;
    const summaryGrid = completion.createDiv({ cls: "al-stats" });
    const resultsHeader = completion.createDiv({ cls: "al-result-head" });
    resultsHeader.createEl("h3", { cls: "al-result-title", text: legacyMetadataText("settings.reportTitle") });
    const resultsCount = resultsHeader.createSpan({ cls: "al-result-meta" });
    const results = completion.createDiv({ cls: "al-search-results" });

    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const close = footer.createEl("button", { cls: "mod-cta", text: legacyMetadataText("settings.close") });
    close.type = "button";
    close.disabled = true;
    close.addEventListener("click", () => this.close());

    const update = (value: LegacyMetadataCleanupProgress): void => {
      const total = Math.max(0, value.total);
      const completed = Math.max(0, Math.min(value.completed, total || value.completed));
      phase.setText(phaseLabel(value.phase));
      message.setText(value.message);
      count.setText(legacyMetadataText("settings.progress", { completed, total }));
      current.setText(value.title || legacyMetadataText("settings.progressWaiting"));
      percent.setText(`${setProgress(progressFill, completed, total)}%`);
    };

    void cleanupLegacyMetadataNotes(this.host.app, this.host.getScanFolders(), {
      enrich: (result) => this.host.enrichExternalMedia(result),
      onProgress: update,
    }).then((summary) => {
      phase.setText(legacyMetadataText("settings.phase.completed"));
      message.setText(summaryText(summary));
      count.setText(legacyMetadataText("settings.progress", { completed: summary.scanned, total: summary.scanned }));
      current.setText(legacyMetadataText("settings.progressComplete"));
      percent.setText(`${setProgress(progressFill, summary.scanned, summary.scanned)}%`);

      summaryGrid.empty();
      appendMetric(summaryGrid, legacyMetadataText("settings.metric.scanned"), summary.scanned);
      appendMetric(summaryGrid, legacyMetadataText("settings.metric.updated"), summary.cleaned);
      appendMetric(summaryGrid, legacyMetadataText("settings.metric.enriched"), summary.enriched);
      appendMetric(summaryGrid, legacyMetadataText("settings.metric.unmatched"), summary.unavailable);
      appendMetric(summaryGrid, legacyMetadataText("settings.metric.failed"), summary.failed);

      results.empty();
      resultsCount.setText(legacyMetadataText("settings.result.count", { count: summary.details.length }));
      if (summary.details.length) {
        for (const detail of summary.details) appendResult(results, detail);
      } else {
        results.createDiv({ cls: "al-search-empty", text: legacyMetadataText("settings.result.empty") });
      }
      completion.hidden = false;
      close.disabled = false;
      if (summary.cleaned > 0) this.host.refreshViews();
      new Notice(summaryText(summary));
    }).catch((error) => {
      console.error("AnimeList legacy metadata upgrade failed", error);
      phase.setText(legacyMetadataText("settings.result.failed"));
      message.setText(legacyMetadataText("settings.failed", {
        error: error instanceof Error ? error.message : String(error),
      }));
      current.setText(legacyMetadataText("settings.progressStopped"));
      close.disabled = false;
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

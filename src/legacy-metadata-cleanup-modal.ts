import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "./app/feature-types";
import { cleanupLegacyMetadataNotes } from "./data/legacy-metadata-cleanup";
import type { LegacyMetadataCleanupProgress, LegacyMetadataCleanupResult } from "./domain/legacy-metadata-types";
import { legacyMetadataText } from "./legacy-metadata-text";
import { legacyMetadataDetailReport } from "./legacy-metadata-report";

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

export class LegacyMetadataCleanupModal extends Modal {
  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-legacy-metadata-cleanup-modal");
    this.titleEl.setText(legacyMetadataText("settings.modalTitle"));
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: legacyMetadataText("settings.modalDescription"),
    });

    const status = this.contentEl.createDiv({ cls: "al-form-section" });
    const phase = status.createEl("strong", { text: legacyMetadataText("settings.phase.scanning") });
    const message = status.createEl("p", { text: legacyMetadataText("settings.preparing") });
    const progress = status.createEl("progress", { cls: "al-legacy-metadata-progress" });
    progress.max = 1;
    progress.value = 0;
    const count = status.createEl("p", {
      text: legacyMetadataText("settings.progress", { completed: 0, total: 0 }),
    });

    const reportSection = this.contentEl.createDiv({ cls: "al-form-section" });
    reportSection.hidden = true;
    reportSection.createEl("strong", { text: legacyMetadataText("settings.reportTitle") });
    const report = reportSection.createEl("textarea");
    report.readOnly = true;
    report.rows = 12;
    report.setAttribute("aria-label", legacyMetadataText("settings.reportTitle"));

    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const close = footer.createEl("button", { cls: "mod-cta", text: legacyMetadataText("settings.close") });
    close.type = "button";
    close.disabled = true;
    close.addEventListener("click", () => this.close());

    const update = (value: LegacyMetadataCleanupProgress): void => {
      progress.max = Math.max(1, value.total);
      progress.value = Math.min(value.completed, progress.max);
      phase.setText(phaseLabel(value.phase));
      message.setText(value.message);
      count.setText(legacyMetadataText("settings.progress", {
        completed: value.completed,
        total: value.total,
      }));
    };

    void cleanupLegacyMetadataNotes(this.host.app, this.host.getScanFolders(), {
      enrich: (result) => this.host.enrichExternalMedia(result),
      onProgress: update,
    }).then((summary) => {
      progress.max = Math.max(1, summary.scanned);
      progress.value = summary.scanned;
      phase.setText(legacyMetadataText("settings.phase.completed"));
      message.setText(summaryText(summary));
      count.setText(legacyMetadataText("settings.progress", {
        completed: summary.scanned,
        total: summary.scanned,
      }));
      const details = legacyMetadataDetailReport(summary);
      if (details) {
        report.value = details;
        reportSection.hidden = false;
      }
      close.disabled = false;
      if (summary.cleaned > 0) this.host.refreshViews();
      new Notice(summaryText(summary));
    }).catch((error) => {
      console.error("AnimeList legacy metadata upgrade failed", error);
      message.setText(legacyMetadataText("settings.failed", {
        error: error instanceof Error ? error.message : String(error),
      }));
      close.disabled = false;
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

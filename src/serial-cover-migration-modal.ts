import { Modal, Notice, type Plugin } from "obsidian";
import type {
  SerialCoverMigrationProgress,
  SerialCoverMigrationSummary,
} from "./serial-cover-service";
import { serialCoverText } from "./serial-cover-text";

export interface SerialCoverMigrationHost extends Pick<Plugin, "app"> {
  loadMissingSerialCovers?: (
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ) => Promise<SerialCoverMigrationSummary>;
}

function summaryVariables(summary: SerialCoverMigrationSummary): Record<string, number> {
  return {
    scanned: summary.scanned,
    loaded: summary.loaded,
    notFound: summary.notFound,
    failed: summary.failed,
    skipped: summary.skipped,
  };
}

export function formatSerialCoverMigrationReport(summary: SerialCoverMigrationSummary): string {
  const lines = [serialCoverText("settings.summary", summaryVariables(summary))];
  for (const detail of summary.details) {
    lines.push(`${detail.status.toUpperCase()} · ${detail.title} · ${detail.label} · ${detail.message}`);
  }
  return lines.join("\n");
}

function phaseLabel(phase: SerialCoverMigrationProgress["phase"]): string {
  return serialCoverText(`settings.phase.${phase}` as const);
}

function createMetric(container: HTMLElement, label: string): HTMLElement {
  const metric = container.createDiv({ cls: "al-serial-cover-migration-metric" });
  metric.createSpan({ cls: "al-serial-cover-migration-metric-value", text: "0" });
  metric.createSpan({ cls: "al-serial-cover-migration-metric-label", text: label });
  return metric;
}

function setMetric(metric: HTMLElement, value: number): void {
  metric.querySelector<HTMLElement>(".al-serial-cover-migration-metric-value")?.setText(String(value));
}

export class SerialCoverMigrationModal extends Modal {
  private controller: AbortController | null = null;
  private running = false;

  constructor(private readonly pluginRef: SerialCoverMigrationHost) {
    super(pluginRef.app);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-serial-cover-migration-modal");
    this.titleEl.setText(serialCoverText("settings.modalTitle"));
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      cls: "al-modal-hint al-serial-cover-migration-description",
      text: serialCoverText("settings.modalDescription"),
    });

    const statusCard = this.contentEl.createDiv({ cls: "al-serial-cover-migration-status-card" });
    const statusHeader = statusCard.createDiv({ cls: "al-serial-cover-migration-status-header" });
    const phase = statusHeader.createSpan({
      cls: "al-serial-cover-migration-phase",
      text: serialCoverText("settings.phase.scanning"),
    });
    const count = statusHeader.createSpan({
      cls: "al-serial-cover-migration-count",
      text: serialCoverText("settings.progressCount", { completed: 0, total: 0 }),
    });
    const message = statusCard.createEl("strong", {
      cls: "al-serial-cover-migration-message",
      text: serialCoverText("settings.preparing"),
    });
    const progress = statusCard.createEl("progress", {
      cls: "al-serial-cover-migration-progress",
    });
    progress.max = 1;
    progress.value = 0;

    const metrics = this.contentEl.createDiv({ cls: "al-serial-cover-migration-metrics" });
    const loadedMetric = createMetric(metrics, serialCoverText("settings.metric.loaded"));
    const notFoundMetric = createMetric(metrics, serialCoverText("settings.metric.notFound"));
    const failedMetric = createMetric(metrics, serialCoverText("settings.metric.failed"));
    const skippedMetric = createMetric(metrics, serialCoverText("settings.metric.skipped"));

    const report = this.contentEl.createEl("pre", { cls: "al-serial-cover-report" });
    report.hidden = true;

    const footer = this.contentEl.createDiv({ cls: "al-modal-actions al-serial-cover-migration-actions" });
    const copyButton = footer.createEl("button", { text: serialCoverText("settings.copy") });
    copyButton.type = "button";
    copyButton.hidden = true;
    const cancelButton = footer.createEl("button", { text: serialCoverText("settings.cancel") });
    cancelButton.type = "button";
    const closeButton = footer.createEl("button", {
      cls: "mod-cta",
      text: serialCoverText("settings.close"),
    });
    closeButton.type = "button";
    closeButton.disabled = true;

    let reportText = "";
    copyButton.addEventListener("click", () => {
      if (!reportText) return;
      void navigator.clipboard.writeText(reportText).then(() => {
        new Notice(serialCoverText("settings.copied"));
      }).catch((error) => {
        console.error("AnimeList serial cover report copy failed", error);
      });
    });
    cancelButton.addEventListener("click", () => {
      if (!this.controller || this.controller.signal.aborted) return;
      this.controller.abort();
      cancelButton.disabled = true;
      cancelButton.setText(serialCoverText("settings.cancelling"));
      message.setText(serialCoverText("settings.cancelling"));
    });
    closeButton.addEventListener("click", () => this.close());

    const setFinished = (summary: SerialCoverMigrationSummary, cancelled: boolean): void => {
      setMetric(loadedMetric, summary.loaded);
      setMetric(notFoundMetric, summary.notFound);
      setMetric(failedMetric, summary.failed);
      setMetric(skippedMetric, summary.skipped);
      progress.max = Math.max(1, summary.scanned);
      progress.value = summary.scanned;
      count.setText(serialCoverText("settings.progressCount", {
        completed: summary.scanned,
        total: summary.scanned,
      }));
      phase.setText(cancelled
        ? serialCoverText("settings.cancelled")
        : serialCoverText("settings.completed"));
      message.setText(serialCoverText("settings.summary", summaryVariables(summary)));
      reportText = formatSerialCoverMigrationReport(summary);
      report.setText(reportText);
      report.hidden = summary.details.length === 0;
      copyButton.hidden = summary.details.length === 0;
      cancelButton.hidden = true;
      closeButton.disabled = false;
    };

    const run = async (): Promise<void> => {
      if (!this.pluginRef.loadMissingSerialCovers) {
        message.setText(serialCoverText("settings.failed"));
        cancelButton.hidden = true;
        closeButton.disabled = false;
        return;
      }
      this.running = true;
      this.controller = new AbortController();
      try {
        const summary = await this.pluginRef.loadMissingSerialCovers((value) => {
          progress.max = Math.max(1, value.total);
          progress.value = Math.min(value.completed, progress.max);
          phase.setText(phaseLabel(value.phase));
          count.setText(serialCoverText("settings.progressCount", {
            completed: value.completed,
            total: value.total,
          }));
          message.setText(value.message);
        }, this.controller.signal);
        const cancelled = this.controller.signal.aborted;
        setFinished(summary, cancelled);
        new Notice(serialCoverText("settings.summary", summaryVariables(summary)));
      } catch (error) {
        console.error("AnimeList serial cover migration failed", error);
        phase.setText(serialCoverText("settings.failedTitle"));
        message.setText(error instanceof Error ? error.message : serialCoverText("settings.failed"));
        cancelButton.hidden = true;
        closeButton.disabled = false;
        new Notice(serialCoverText("settings.failed"));
      } finally {
        this.running = false;
        this.controller = null;
      }
    };

    void run();
  }

  onClose(): void {
    if (this.running) this.controller?.abort();
    this.contentEl.empty();
  }
}

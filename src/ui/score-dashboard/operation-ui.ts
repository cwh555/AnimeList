import { Modal, type App } from "obsidian";
import { scoreDashboardText as text } from "../../features/score-dashboard/text";
import { createUiAction } from "../ui-primitives";

export interface ScoreDashboardClampSummary {
  lowCount: number;
  highCount: number;
}

class ScoreDashboardClampModal extends Modal {
  private resolveResult: ((confirmed: boolean) => void) | null;

  constructor(app: App, private readonly summary: ScoreDashboardClampSummary, resolve: (confirmed: boolean) => void) {
    super(app);
    this.resolveResult = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("animelist-modal", "al-dialog-compact");
    contentEl.addClass("al-score-confirm-modal");
    contentEl.createEl("h2", { text: text.shiftClampTitle });
    contentEl.createEl("p", { text: text.shiftClampMessage(this.summary.lowCount, this.summary.highCount) });
    const details = contentEl.createDiv({ cls: "al-score-confirm-summary" });
    if (this.summary.highCount) details.createDiv({ text: text.shiftClampHigh(this.summary.highCount) });
    if (this.summary.lowCount) details.createDiv({ text: text.shiftClampLow(this.summary.lowCount) });
    const actions = contentEl.createDiv({ cls: "modal-button-container al-modal-actions" });
    const cancel = createUiAction(text.cancel);
    actions.appendChild(cancel);
    cancel.addEventListener("click", () => this.finish(false));
    const confirm = createUiAction(text.confirmClamp, "primary");
    actions.appendChild(confirm);
    confirm.addEventListener("click", () => this.finish(true));
    confirm.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.finish(false, false);
  }

  private finish(confirmed: boolean, close = true): void {
    const resolve = this.resolveResult;
    if (!resolve) return;
    this.resolveResult = null;
    resolve(confirmed);
    if (close) this.close();
  }
}

export function confirmScoreDashboardClamp(app: App, summary: ScoreDashboardClampSummary): Promise<boolean> {
  return new Promise((resolve) => new ScoreDashboardClampModal(app, summary, resolve).open());
}

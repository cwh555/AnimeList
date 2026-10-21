import { AnimeListModal } from "./animelist-modal";
import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import { SUPPORTED_LOCALES, normalizeSupportedLocale, type SupportedLocale } from "../i18n/locale";
import { getActiveLocale } from "../i18n/catalog";
import { applyStoredTitleUpdates, planStoredTitleUpdates, type TitleUpdatePlan } from "../data/title-localization-service";
import { titleLocalizationSettingsText as text } from "../features/title-localization/text";

const NAMES: Record<SupportedLocale, string> = {
  "zh-TW": "Traditional Chinese",
  "zh-CN": "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
};

export class TitleLocalizationModal extends AnimeListModal {
  private abort?: AbortController;
  private closed = false;
  private busy = false;

  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
  }

  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass("animelist-modal", "al-title-localization-modal");
    this.titleEl.setText(text("modal.title"));
    this.renderSelection();
  }

  private renderSelection(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { cls: "al-modal-hint", text: text("modal.description") });
    const label = this.contentEl.createEl("label", { cls: "al-form-field" });
    label.createSpan({ text: text("modal.language") });
    const select = label.createEl("select");
    for (const locale of SUPPORTED_LOCALES) {
      const option = select.createEl("option", { value: locale, text: NAMES[locale] });
      option.value = locale;
    }
    select.value = normalizeSupportedLocale(getActiveLocale()) ?? "zh-TW";
    this.contentEl.createEl("p", { cls: "al-modal-hint", text: text("modal.warning") });

    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const cancel = footer.createEl("button", { text: text("modal.cancel") });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const preview = footer.createEl("button", { cls: "mod-cta", text: text("modal.preview") });
    preview.type = "button";
    preview.addEventListener("click", () => {
      if (this.busy) return;
      const locale = normalizeSupportedLocale(select.value);
      if (!locale) return;
      this.renderPreview(locale);
    });
  }

  private renderPreview(locale: SupportedLocale): void {
    this.busy = true;
    this.contentEl.empty();
    const status = this.contentEl.createEl("p", { cls: "al-version-cleanup-status", text: text("modal.scanning", { completed: 0, total: 0 }) });
    const activity = this.contentEl.createDiv({ cls: "al-version-cleanup-list" });
    activity.setAttribute("aria-live", "polite");
    const cancel = this.contentEl.createEl("button", { text: text("modal.cancel") });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const controller = new AbortController();
    this.abort = controller;
    void planStoredTitleUpdates(this.host.app, this.host.getScanFolders(), locale, {
      signal: controller.signal,
      onProgress: (completed, total, row) => {
        if (this.closed) return;
        status.setText(text("modal.scanning", { completed, total }) + " — " + row.title);
        const entry = activity.createDiv({ cls: "al-version-cleanup-item" });
        entry.createEl("strong", { text: row.title });
        entry.createDiv({ cls: "al-result-meta", text: row.status + ": " + row.reason });
        entry.createDiv({ cls: "al-result-meta", text: row.path });
        activity.scrollTop = activity.scrollHeight;
      },
    }).then((plan) => {
      if (!this.closed) this.renderReview(plan);
    }).catch((error) => {
      if (!this.closed) {
        console.error("AnimeList title localization preview failed", error);
        this.contentEl.empty();
        this.contentEl.createEl("p", { cls: "al-modal-warning", text: text("modal.error", { error: error instanceof Error ? error.message : String(error) }) });
        const back = this.contentEl.createEl("button", { text: text("modal.back") });
        back.type = "button";
        back.addEventListener("click", () => this.renderSelection());
      }
    }).finally(() => { this.busy = false; });
  }

  private renderReview(plan: TitleUpdatePlan): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      cls: "al-version-cleanup-status",
      text: text("modal.summary", { scanned: plan.scanned, available: plan.items.length, skipped: plan.skipped, failed: plan.failures.length }),
    });
    if (plan.failures.length) {
      const failures = this.contentEl.createEl("details");
      failures.createEl("summary", { text: text("modal.failures", { count: plan.failures.length }) });
      const list = failures.createEl("ul");
      for (const failure of plan.failures) list.createEl("li", { text: `${failure.path}: ${failure.message}` });
    }
    const list = this.contentEl.createDiv({ cls: "al-version-cleanup-list" });
    const checks = new Map<string, HTMLInputElement>();
    if (!plan.items.length) list.createDiv({ cls: "al-search-empty", text: text("modal.empty") });
    for (const outcome of plan.rows) {
      const entry = list.createDiv({ cls: "al-version-cleanup-item" });
      const proposal = outcome.proposal;
      if (proposal) {
        const label = entry.createEl("label");
        const checkbox = label.createEl("input", { type: "checkbox" });
        checkbox.checked = !proposal.requiresReview;
        label.append(" ");
        label.createEl("strong", { text: proposal.oldTitle + " → " + proposal.newTitle });
        checks.set(proposal.path, checkbox);
      } else {
        entry.createEl("strong", { text: outcome.title });
      }
      entry.createDiv({ cls: "al-result-meta", text: outcome.status + ": " + outcome.reason });
      entry.createDiv({ cls: "al-result-meta", text: outcome.path });
      if (proposal?.source?.provider === "bangumi") {
        const source = proposal.source;
        const href = "https://bgm.tv/subject/" + source.id;
        const link = entry.createEl("a", { text: source.provider + " #" + source.id });
        link.href = href;
        link.setAttribute("rel", "noopener noreferrer");
        link.setAttribute("target", "_blank");
      }
    }
    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const back = footer.createEl("button", { text: text("modal.back") });
    back.type = "button";
    back.addEventListener("click", () => this.renderSelection());
    const apply = footer.createEl("button", { cls: "mod-cta", text: text("modal.apply") });
    apply.type = "button";
    apply.disabled = ![...checks.values()].some(checkbox => checkbox.checked);
    const updateApplyState = (): void => { apply.disabled = ![...checks.values()].some(checkbox => checkbox.checked); };
    for (const checkbox of checks.values()) checkbox.addEventListener("change", updateApplyState);
    apply.addEventListener("click", () => {
      if (this.busy) return;
      const selected = new Set([...checks].filter(([, checkbox]) => checkbox.checked).map(([path]) => path));
      if (!selected.size) return;
      this.busy = true;
      apply.disabled = true;
      back.disabled = true;
      void applyStoredTitleUpdates(this.host.app, plan, selected).then((result) => {
        if (result.updated) this.host.refreshViews();
        if (this.closed) {
          new Notice(text("modal.done", { updated: result.updated, skipped: result.skipped, failed: result.failed }));
          return;
        }
        this.contentEl.empty();
        this.contentEl.createEl("p", {
          cls: "al-version-cleanup-status",
          text: text("modal.done", { updated: result.updated, skipped: result.skipped, failed: result.failed }),
        });
        if (result.errors.length) {
          const errors = this.contentEl.createEl("ul");
          for (const error of result.errors) errors.createEl("li", { text: `${error.path}: ${error.message}` });
        }
        const close = this.contentEl.createEl("button", { cls: "mod-cta", text: text("modal.close") });
        close.type = "button";
        close.addEventListener("click", () => this.close());
        new Notice(text("modal.done", { updated: result.updated, skipped: result.skipped, failed: result.failed }));
      }).catch((error) => {
        console.error("AnimeList title localization write failed", error);
        if (!this.closed) this.contentEl.createEl("p", { cls: "al-modal-warning", text: text("modal.error", { error: error instanceof Error ? error.message : String(error) }) });
      }).finally(() => { this.busy = false; });
    });
  }

  onClose(): void {
    this.closed = true;
    this.abort?.abort();
    this.contentEl.empty();
  }
}

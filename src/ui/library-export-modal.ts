import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import {
  buildLibraryTextExportRows,
  filterLibraryExportItems,
  type LibraryExportFormat,
  type LibraryExportScope,
} from "../domain/library-export";
import { LibraryExportService } from "../data/library-export-service";
import {
  compileLibraryTextExportTemplate,
  defaultLibraryTextExportTemplate,
  formatLibraryTextExport,
  libraryTextTemplateIssueMessage,
} from "../features/library-export/format";
import { libraryExportText } from "../features/library-export/text";
import { uiText } from "../ui-text";
import { errorMessage, makeEl } from "./ui-helpers";
import { createLibraryExportOptions, type LibraryExportOptionsView } from "./library-export-options";
import {
  createLibraryExportPreview,
  type LibraryExportOutput,
  type LibraryExportPreviewView,
} from "./library-export-preview";

interface LibraryExportModalState {
  format: LibraryExportFormat;
  scope: LibraryExportScope;
  textTemplate: string;
}

export class LibraryExportModal extends Modal {
  private readonly service: LibraryExportService;
  private readonly exportedAt = new Date().toISOString();
  private readonly state: LibraryExportModalState = {
    format: "json",
    scope: { mediaType: "all", status: "all" },
    textTemplate: defaultLibraryTextExportTemplate(),
  };
  private items: MediaItem[] = [];
  private optionsView: LibraryExportOptionsView | null = null;
  private previewView: LibraryExportPreviewView | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
    this.service = new LibraryExportService(host);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "al-library-export-modal");
    Object.assign(this.modalEl.style, {
      width: "min(980px, calc(100vw - 28px))",
      maxWidth: "980px",
      boxSizing: "border-box",
    });
    this.titleEl.textContent = libraryExportText("title");
    this.items = this.host.collectMediaItems();
    this.buildView();
  }

  private output(): LibraryExportOutput {
    const items = filterLibraryExportItems(this.items, this.state.scope);
    if (this.state.format === "json") {
      return { content: this.service.createJson(items, this.exportedAt), count: items.length };
    }
    const rows = buildLibraryTextExportRows(items);
    const compilation = compileLibraryTextExportTemplate(this.state.textTemplate);
    return {
      content: formatLibraryTextExport(rows, this.state.textTemplate, compilation),
      count: rows.length,
    };
  }

  private templateIssueMessages(): string[] {
    if (this.state.format !== "text") return [];
    return compileLibraryTextExportTemplate(this.state.textTemplate).issues.map(libraryTextTemplateIssueMessage);
  }

  private syncView(): void {
    const issues = this.templateIssueMessages();
    this.optionsView?.update(this.state.format, this.state.scope, this.state.textTemplate, issues);
    this.previewView?.update(this.state.format, this.output());
    const disabled = this.state.format === "text" && issues.length > 0;
    if (this.copyButton) this.copyButton.disabled = disabled;
    if (this.saveButton) this.saveButton.disabled = disabled;
  }

  private async copy(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(this.output().content);
      new Notice(libraryExportText("copied"));
    } catch (error) {
      new Notice(libraryExportText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async save(): Promise<void> {
    try {
      const path = await this.service.saveToVault(this.output().content, this.state.format);
      new Notice(libraryExportText("saved", { path }));
    } catch (error) {
      new Notice(libraryExportText("saveFailed", { error: errorMessage(error) }));
    }
  }

  private buildView(): void {
    this.contentEl.replaceChildren();
    const intro = makeEl("p", "al-library-export-intro", libraryExportText("description"));
    Object.assign(intro.style, {
      maxWidth: "760px",
      margin: "6px 0 16px",
      color: "var(--text-muted)",
      fontSize: ".74rem",
      lineHeight: "1.55",
    });
    const body = makeEl("div", "al-library-export-layout");
    Object.assign(body.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "18px",
      alignItems: "stretch",
      minWidth: "0",
    });

    const initialIssues = this.templateIssueMessages();
    this.optionsView = createLibraryExportOptions(
      this.state.format,
      this.state.scope,
      this.state.textTemplate,
      initialIssues,
      {
        onFormatChange: (format) => {
          if (this.state.format === format) return;
          this.state.format = format;
          this.syncView();
        },
        onScopeChange: (scope) => {
          this.state.scope = scope;
          this.syncView();
        },
        onTemplateChange: (template) => {
          if (this.state.textTemplate === template) return;
          this.state.textTemplate = template;
          this.syncView();
        },
      },
    );
    this.previewView = createLibraryExportPreview(this.state.format, this.output());
    Object.assign(this.optionsView.element.style, { flex: "1 1 300px", minWidth: "0" });
    Object.assign(this.previewView.element.style, { flex: "2 1 440px", minWidth: "0" });
    body.append(this.optionsView.element, this.previewView.element);

    const actions = makeEl("div", "al-modal-actions al-library-export-actions");
    Object.assign(actions.style, {
      marginTop: "14px",
      paddingTop: "14px",
      borderTop: "1px solid var(--background-modifier-border)",
    });
    const destination = makeEl("span", "al-library-export-save-location", libraryExportText("saveLocation", {
      path: `${this.service.exportFolderPath()}/`,
    }));
    Object.assign(destination.style, {
      flex: "1 1 220px",
      minWidth: "0",
      color: "var(--text-faint)",
      fontSize: ".64rem",
      overflowWrap: "anywhere",
    });
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const copy = makeEl("button", "al-secondary-button", libraryExportText("copy"));
    copy.type = "button";
    copy.addEventListener("click", () => { void this.copy(); });
    const save = makeEl("button", "mod-cta", libraryExportText("save"));
    save.type = "button";
    save.addEventListener("click", () => { void this.save(); });
    this.copyButton = copy;
    this.saveButton = save;
    actions.append(destination, cancel, copy, save);

    this.contentEl.append(intro, body, actions);
    this.syncView();
  }

  onClose(): void {
    this.optionsView = null;
    this.previewView = null;
    this.copyButton = null;
    this.saveButton = null;
    this.contentEl.replaceChildren();
  }
}

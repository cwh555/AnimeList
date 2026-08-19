import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import {
  DEFAULT_LIBRARY_TEXT_EXPORT_FIELDS,
  buildLibraryTextExportRows,
  filterLibraryExportItems,
  type LibraryExportFormat,
  type LibraryExportScope,
  type LibraryTextExportField,
} from "../domain/library-export";
import { LibraryExportService } from "../data/library-export-service";
import { libraryExportText } from "../features/library-export/text";
import { formatLibraryTextExport } from "../features/library-export/format";
import { uiText } from "../ui-text";
import { errorMessage, makeEl } from "./ui-helpers";
import {
  renderLibraryExportFormatTabs,
  renderLibraryExportScope,
  renderLibraryExportTextFields,
} from "./library-export-options";
import { renderLibraryExportPreview, type LibraryExportOutput } from "./library-export-preview";

interface LibraryExportModalState {
  format: LibraryExportFormat;
  scope: LibraryExportScope;
  textFields: Set<LibraryTextExportField>;
}

export class LibraryExportModal extends Modal {
  private readonly service: LibraryExportService;
  private readonly exportedAt = new Date().toISOString();
  private readonly state: LibraryExportModalState = {
    format: "json",
    scope: { mediaType: "all", status: "all" },
    textFields: new Set(DEFAULT_LIBRARY_TEXT_EXPORT_FIELDS),
  };
  private items: MediaItem[] = [];

  constructor(private readonly host: AnimeListFeatureHost) {
    super(host.app);
    this.service = new LibraryExportService(host);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "al-library-export-modal");
    this.modalEl.setCssStyles({ boxSizing: "border-box" });
    this.titleEl.textContent = libraryExportText("title");
    this.items = this.host.collectMediaItems();
    this.render();
  }

  private output(): LibraryExportOutput {
    const items = filterLibraryExportItems(this.items, this.state.scope);
    if (this.state.format === "json") {
      return { content: this.service.createJson(items, this.exportedAt), count: items.length };
    }
    const rows = buildLibraryTextExportRows(items);
    return { content: formatLibraryTextExport(rows, this.state.textFields), count: rows.length };
  }

  private async copy(output: LibraryExportOutput): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(output.content);
      new Notice(libraryExportText("copied"));
    } catch (error) {
      new Notice(libraryExportText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async save(output: LibraryExportOutput): Promise<void> {
    try {
      const path = await this.service.saveToVault(output.content, this.state.format);
      new Notice(libraryExportText("saved", { path }));
    } catch (error) {
      new Notice(libraryExportText("saveFailed", { error: errorMessage(error) }));
    }
  }

  private render(): void {
    const output = this.output();
    this.contentEl.replaceChildren();
    this.contentEl.appendChild(makeEl("p", "al-modal-hint", libraryExportText("description")));
    renderLibraryExportFormatTabs(this.contentEl, this.state.format, (format) => {
      this.state.format = format;
      this.render();
    });
    renderLibraryExportScope(this.contentEl, this.state.scope, (scope) => {
      this.state.scope = scope;
      this.render();
    });
    renderLibraryExportTextFields(this.contentEl, this.state.format, this.state.textFields, (field, checked) => {
      if (checked) this.state.textFields.add(field);
      else this.state.textFields.delete(field);
      this.render();
    });
    renderLibraryExportPreview(this.contentEl, this.state.format, output);

    const actions = makeEl("div", "al-modal-actions al-library-export-actions");
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const copy = makeEl("button", "al-secondary-button", libraryExportText("copy"));
    copy.type = "button";
    copy.addEventListener("click", () => { void this.copy(this.output()); });
    const save = makeEl("button", "mod-cta", libraryExportText("save"));
    save.type = "button";
    save.addEventListener("click", () => { void this.save(this.output()); });
    actions.append(cancel, copy, save);
    this.contentEl.appendChild(actions);
  }

  onClose(): void {
    this.contentEl.replaceChildren();
  }
}

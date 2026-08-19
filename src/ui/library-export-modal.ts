import { Modal, Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import {
  DEFAULT_LIBRARY_TEXT_EXPORT_FIELDS,
  LIBRARY_TEXT_EXPORT_FIELDS,
  buildLibraryTextExportRows,
  filterLibraryExportItems,
  type LibraryExportFormat,
  type LibraryExportMediaFilter,
  type LibraryExportScope,
  type LibraryTextExportField,
} from "../domain/library-export";
import { MEDIA_STATUS_VALUES, type MediaStatusFilter } from "../domain/media-status";
import { LibraryExportService } from "../data/library-export-service";
import { libraryExportText } from "../features/library-export/text";
import {
  formatLibraryTextExport,
  libraryTextFieldLabel,
} from "../features/library-export/format";
import { uiText } from "../ui-text";
import { errorMessage, makeEl, MEDIA_UI_LABELS } from "./ui-helpers";

interface LibraryExportModalState {
  format: LibraryExportFormat;
  scope: LibraryExportScope;
  textFields: Set<LibraryTextExportField>;
}

interface ExportOutput {
  content: string;
  count: number;
}

const MAX_PREVIEW_LINES = 80;
const MAX_PREVIEW_CHARS = 16_000;

function previewText(content: string): { text: string; truncated: boolean } {
  const lines = content.split("\n");
  let text = lines.slice(0, MAX_PREVIEW_LINES).join("\n");
  let truncated = lines.length > MAX_PREVIEW_LINES;
  if (text.length > MAX_PREVIEW_CHARS) {
    text = text.slice(0, MAX_PREVIEW_CHARS);
    truncated = true;
  }
  return { text: truncated ? `${text.trimEnd()}\n…` : text, truncated };
}

function appendOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = makeEl("option", "", label);
  option.value = value;
  select.appendChild(option);
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
    this.titleEl.textContent = libraryExportText("title");
    this.items = this.host.collectMediaItems();
    this.render();
  }

  private scopedItems() {
    return filterLibraryExportItems(this.items, this.state.scope);
  }

  private output(): ExportOutput {
    const items = this.scopedItems();
    if (this.state.format === "json") {
      return {
        content: this.service.createJson(items, this.exportedAt),
        count: items.length,
      };
    }
    const rows = buildLibraryTextExportRows(items);
    return {
      content: formatLibraryTextExport(rows, this.state.textFields),
      count: rows.length,
    };
  }

  private setFormat(format: LibraryExportFormat): void {
    if (this.state.format === format) return;
    this.state.format = format;
    this.render();
  }

  private renderFormatTabs(parent: HTMLElement): void {
    const section = makeEl("section", "al-library-export-section");
    section.appendChild(makeEl("strong", "al-library-export-section-title", libraryExportText("format")));
    const tabs = makeEl("div", "al-library-export-format-tabs");
    for (const format of ["json", "text"] as const) {
      const button = makeEl(
        "button",
        `al-library-export-format${this.state.format === format ? " is-active" : ""}`,
        libraryExportText(format),
      );
      button.type = "button";
      button.setAttribute("aria-pressed", this.state.format === format ? "true" : "false");
      button.addEventListener("click", () => this.setFormat(format));
      tabs.appendChild(button);
    }
    section.append(
      tabs,
      makeEl(
        "p",
        "al-library-export-description",
        libraryExportText(this.state.format === "json" ? "jsonDescription" : "textDescription"),
      ),
    );
    parent.appendChild(section);
  }

  private renderScope(parent: HTMLElement): void {
    const section = makeEl("section", "al-library-export-section");
    section.appendChild(makeEl("strong", "al-library-export-section-title", libraryExportText("scope")));
    const grid = makeEl("div", "al-library-export-scope");

    const mediaField = makeEl("label", "al-library-export-field");
    mediaField.appendChild(makeEl("span", "", libraryExportText("mediaType")));
    const media = makeEl("select");
    appendOption(media, "all", MEDIA_UI_LABELS.type.all);
    for (const type of ["anime", "manga", "novel"] as const) appendOption(media, type, MEDIA_UI_LABELS.type[type]);
    media.value = this.state.scope.mediaType;
    media.addEventListener("change", () => {
      this.state.scope.mediaType = media.value as LibraryExportMediaFilter;
      this.render();
    });
    mediaField.appendChild(media);

    const statusField = makeEl("label", "al-library-export-field");
    statusField.appendChild(makeEl("span", "", libraryExportText("status")));
    const status = makeEl("select");
    appendOption(status, "all", uiText("media.status.all"));
    for (const value of MEDIA_STATUS_VALUES) appendOption(status, value, uiText(`media.status.${value}`));
    status.value = this.state.scope.status;
    status.addEventListener("change", () => {
      this.state.scope.status = status.value as MediaStatusFilter;
      this.render();
    });
    statusField.appendChild(status);

    grid.append(mediaField, statusField);
    section.appendChild(grid);
    parent.appendChild(section);
  }

  private renderTextFields(parent: HTMLElement): void {
    if (this.state.format !== "text") return;
    const section = makeEl("section", "al-library-export-section");
    section.append(
      makeEl("strong", "al-library-export-section-title", libraryExportText("fields")),
      makeEl("p", "al-library-export-description", libraryExportText("requiredFields")),
    );
    const fields = makeEl("div", "al-library-export-fields");
    for (const fixed of ["fieldTime", "fieldWork"] as const) {
      const label = makeEl("label", "al-library-export-checkbox is-required");
      const input = makeEl("input");
      input.type = "checkbox";
      input.checked = true;
      input.disabled = true;
      label.append(input, makeEl("span", "", libraryExportText(fixed)));
      fields.appendChild(label);
    }
    for (const field of LIBRARY_TEXT_EXPORT_FIELDS) {
      const label = makeEl("label", "al-library-export-checkbox");
      const input = makeEl("input");
      input.type = "checkbox";
      input.checked = this.state.textFields.has(field);
      input.addEventListener("change", () => {
        if (input.checked) this.state.textFields.add(field);
        else this.state.textFields.delete(field);
        this.render();
      });
      label.append(input, makeEl("span", "", libraryTextFieldLabel(field)));
      fields.appendChild(label);
    }
    section.appendChild(fields);
    parent.appendChild(section);
  }

  private renderPreview(parent: HTMLElement, output: ExportOutput): void {
    const section = makeEl("section", "al-library-export-section al-library-export-preview-section");
    const heading = makeEl("div", "al-library-export-preview-heading");
    heading.append(
      makeEl("strong", "al-library-export-section-title", libraryExportText("preview")),
      makeEl(
        "span",
        "al-library-export-count",
        libraryExportText(this.state.format === "json" ? "jsonSummary" : "textSummary", { count: output.count }),
      ),
    );
    const preview = previewText(output.content);
    const text = makeEl("textarea", "al-library-export-preview");
    text.readOnly = true;
    text.spellcheck = false;
    text.value = preview.text;
    text.setAttribute("aria-label", libraryExportText("preview"));
    section.append(heading, text);
    if (preview.truncated) {
      section.appendChild(makeEl("p", "al-library-export-preview-note", libraryExportText("previewTruncated")));
    }
    parent.appendChild(section);
  }

  private async copy(output: ExportOutput): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(output.content);
      new Notice(libraryExportText("copied"));
    } catch (error) {
      new Notice(libraryExportText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async save(output: ExportOutput): Promise<void> {
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
    this.renderFormatTabs(this.contentEl);
    this.renderScope(this.contentEl);
    this.renderTextFields(this.contentEl);
    this.renderPreview(this.contentEl, output);

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

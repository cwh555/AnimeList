import {
  LIBRARY_TEXT_EXPORT_FIELDS,
  type LibraryExportFormat,
  type LibraryExportMediaFilter,
  type LibraryExportScope,
  type LibraryTextExportField,
} from "../domain/library-export";
import { MEDIA_STATUS_VALUES, type MediaStatusFilter } from "../domain/media-status";
import { libraryExportText } from "../features/library-export/text";
import { libraryTextFieldLabel } from "../features/library-export/format";
import { uiText } from "../ui-text";
import { makeEl, MEDIA_UI_LABELS } from "./ui-helpers";

function appendOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = makeEl("option", "", label);
  option.value = value;
  select.appendChild(option);
}

export interface LibraryExportOptionsCallbacks {
  onFormatChange(format: LibraryExportFormat): void;
  onScopeChange(scope: LibraryExportScope): void;
  onFieldChange(field: LibraryTextExportField, checked: boolean): void;
}

export interface LibraryExportOptionsView {
  element: HTMLElement;
  update(
    format: LibraryExportFormat,
    scope: LibraryExportScope,
    selected: ReadonlySet<LibraryTextExportField>,
  ): void;
}

export function createLibraryExportOptions(
  format: LibraryExportFormat,
  scope: LibraryExportScope,
  selected: ReadonlySet<LibraryTextExportField>,
  callbacks: LibraryExportOptionsCallbacks,
): LibraryExportOptionsView {
  const root = makeEl("div", "al-library-export-controls");
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: "0",
  });

  const styleCard = (section: HTMLElement): void => {
    Object.assign(section.style, {
      minWidth: "0",
      padding: "14px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "12px",
      background: "color-mix(in srgb, var(--background-secondary) 82%, transparent)",
    });
  };
  const styleTitle = (title: HTMLElement): void => {
    Object.assign(title.style, {
      display: "block",
      margin: "0 0 10px",
      color: "var(--text-normal)",
      fontSize: ".76rem",
      fontWeight: "720",
    });
  };
  const styleDescription = (description: HTMLElement): void => {
    Object.assign(description.style, {
      margin: "9px 0 0",
      color: "var(--text-faint)",
      fontSize: ".66rem",
      lineHeight: "1.45",
    });
  };

  const formatSection = makeEl("section", "al-library-export-card al-library-export-format-section");
  styleCard(formatSection);
  const formatTitle = makeEl("strong", "al-library-export-section-title", libraryExportText("format"));
  styleTitle(formatTitle);
  formatSection.appendChild(formatTitle);
  const tabs = makeEl("div", "al-modal-type-tabs al-library-export-format-tabs");
  Object.assign(tabs.style, { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", margin: "0" });
  const formatButtons = new Map<LibraryExportFormat, HTMLButtonElement>();
  for (const value of ["json", "text"] as const) {
    const button = makeEl("button", "al-modal-type al-library-export-format", libraryExportText(value));
    button.type = "button";
    button.addEventListener("click", () => callbacks.onFormatChange(value));
    formatButtons.set(value, button);
    tabs.appendChild(button);
  }
  const formatDescription = makeEl("p", "al-library-export-description");
  styleDescription(formatDescription);
  formatSection.append(tabs, formatDescription);

  const scopeSection = makeEl("section", "al-library-export-card al-library-export-scope-section");
  styleCard(scopeSection);
  const scopeTitle = makeEl("strong", "al-library-export-section-title", libraryExportText("scope"));
  styleTitle(scopeTitle);
  scopeSection.appendChild(scopeTitle);
  const scopeFields = makeEl("div", "al-library-export-scope");
  Object.assign(scopeFields.style, {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "10px",
  });

  const mediaField = makeEl("label", "al-form-field al-library-export-field");
  mediaField.appendChild(makeEl("span", "al-form-label", libraryExportText("mediaType")));
  const media = makeEl("select");
  appendOption(media, "all", MEDIA_UI_LABELS.type.all);
  for (const type of ["anime", "manga", "novel"] as const) appendOption(media, type, MEDIA_UI_LABELS.type[type]);
  Object.assign(media.style, { width: "100%", minHeight: "38px" });
  mediaField.appendChild(media);

  const statusField = makeEl("label", "al-form-field al-library-export-field");
  statusField.appendChild(makeEl("span", "al-form-label", libraryExportText("status")));
  const status = makeEl("select");
  appendOption(status, "all", uiText("media.status.all"));
  for (const value of MEDIA_STATUS_VALUES) appendOption(status, value, uiText(`media.status.${value}`));
  Object.assign(status.style, { width: "100%", minHeight: "38px" });
  statusField.appendChild(status);
  scopeFields.append(mediaField, statusField);
  scopeSection.appendChild(scopeFields);

  const emitScope = (): void => callbacks.onScopeChange({
    mediaType: media.value as LibraryExportMediaFilter,
    status: status.value as MediaStatusFilter,
  });
  media.addEventListener("change", emitScope);
  status.addEventListener("change", emitScope);

  const fieldsSection = makeEl("section", "al-library-export-card al-library-export-fields-section");
  styleCard(fieldsSection);
  const fieldsTitle = makeEl("strong", "al-library-export-section-title", libraryExportText("fields"));
  styleTitle(fieldsTitle);
  const fieldsDescription = makeEl("p", "al-library-export-description", libraryExportText("requiredFields"));
  styleDescription(fieldsDescription);
  fieldsSection.append(fieldsTitle, fieldsDescription);
  const fields = makeEl("div", "al-library-export-fields");
  Object.assign(fields.style, {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
    gap: "6px",
    marginTop: "10px",
  });
  const fieldInputs = new Map<LibraryTextExportField, HTMLInputElement>();
  for (const field of LIBRARY_TEXT_EXPORT_FIELDS) {
    const label = makeEl("label", "al-library-export-checkbox");
    Object.assign(label.style, {
      display: "flex",
      minWidth: "0",
      minHeight: "34px",
      alignItems: "center",
      gap: "9px",
      padding: "6px 8px",
      borderRadius: "8px",
      color: "var(--text-muted)",
      fontSize: ".7rem",
      cursor: "pointer",
    });
    const input = makeEl("input");
    input.type = "checkbox";
    input.addEventListener("change", () => callbacks.onFieldChange(field, input.checked));
    label.append(input, makeEl("span", "", libraryTextFieldLabel(field)));
    fieldInputs.set(field, input);
    fields.appendChild(label);
  }
  fieldsSection.appendChild(fields);

  root.append(formatSection, scopeSection, fieldsSection);

  const update = (
    nextFormat: LibraryExportFormat,
    nextScope: LibraryExportScope,
    nextSelected: ReadonlySet<LibraryTextExportField>,
  ): void => {
    for (const [value, button] of formatButtons) {
      const active = value === nextFormat;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    formatDescription.textContent = libraryExportText(
      nextFormat === "json" ? "jsonDescription" : "textDescription",
    );
    fieldsSection.hidden = nextFormat !== "text";
    if (media.value !== nextScope.mediaType) media.value = nextScope.mediaType;
    if (status.value !== nextScope.status) status.value = nextScope.status;
    for (const [field, input] of fieldInputs) {
      const checked = nextSelected.has(field);
      if (input.checked !== checked) input.checked = checked;
    }
  };

  update(format, scope, selected);
  return { element: root, update };
}

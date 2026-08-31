import type { SpecialLabelMode } from "../domain/masterpiece-labels";
import type {
  LibraryExportFormat,
  LibraryExportMediaFilter,
  LibraryExportScope,
} from "../domain/library-export";
import { MEDIA_STATUS_VALUES, type MediaStatusFilter } from "../domain/media-status";
import {
  defaultLibraryTextExportTemplate,
  libraryTextTemplateVariableOptions,
} from "../features/library-export/format";
import { libraryExportText } from "../features/library-export/text";
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
  onTemplateChange(template: string): void;
}

export interface LibraryExportOptionsView {
  element: HTMLElement;
  template: HTMLTextAreaElement;
  update(
    format: LibraryExportFormat,
    scope: LibraryExportScope,
    template: string,
    templateIssues: readonly string[],
  ): void;
}

export function createLibraryExportOptions(
  format: LibraryExportFormat,
  scope: LibraryExportScope,
  templateValue: string,
  templateIssues: readonly string[],
  specialLabelMode: SpecialLabelMode,
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

  const templateSection = makeEl("section", "al-library-export-card al-library-export-template-section");
  styleCard(templateSection);
  const templateHeading = makeEl("div", "al-library-export-template-heading");
  Object.assign(templateHeading.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    marginBottom: "8px",
  });
  const templateTitle = makeEl("strong", "al-library-export-section-title", libraryExportText("template"));
  styleTitle(templateTitle);
  Object.assign(templateTitle.style, { margin: "0" });
  const reset = makeEl("button", "al-secondary-button", libraryExportText("templateReset"));
  reset.type = "button";
  Object.assign(reset.style, { minHeight: "30px", padding: "0 9px", fontSize: ".66rem" });
  reset.addEventListener("click", () => callbacks.onTemplateChange(defaultLibraryTextExportTemplate()));
  templateHeading.append(templateTitle, reset);

  const templateDescription = makeEl("p", "al-library-export-description", libraryExportText("templateDescription"));
  styleDescription(templateDescription);
  Object.assign(templateDescription.style, { margin: "0 0 9px" });

  const template = makeEl("textarea", "al-library-export-template");
  template.spellcheck = false;
  template.setAttribute("aria-label", libraryExportText("template"));
  Object.assign(template.style, {
    width: "100%",
    minWidth: "0",
    minHeight: "104px",
    resize: "vertical",
    padding: "10px 11px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "8px",
    background: "var(--background-primary)",
    color: "var(--text-normal)",
    fontFamily: "var(--font-monospace)",
    fontSize: ".68rem",
    lineHeight: "1.5",
    boxSizing: "border-box",
  });
  template.addEventListener("input", () => callbacks.onTemplateChange(template.value));

  const variableLabel = makeEl("span", "al-library-export-variable-label", libraryExportText("templateVariables"));
  Object.assign(variableLabel.style, {
    display: "block",
    marginTop: "9px",
    color: "var(--text-muted)",
    fontSize: ".66rem",
    fontWeight: "650",
  });
  const variables = makeEl("div", "al-library-export-template-variables");
  Object.assign(variables.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "6px",
  });
  for (const variable of libraryTextTemplateVariableOptions(specialLabelMode)) {
    const button = makeEl("button", "al-secondary-button al-library-export-template-variable", variable.token);
    button.type = "button";
    button.title = variable.label;
    Object.assign(button.style, {
      minHeight: "28px",
      padding: "0 8px",
      fontFamily: "var(--font-monospace)",
      fontSize: ".61rem",
    });
    button.addEventListener("click", () => {
      const start = template.selectionStart ?? template.value.length;
      const end = template.selectionEnd ?? start;
      template.setRangeText(variable.token, start, end, "end");
      template.focus();
      callbacks.onTemplateChange(template.value);
    });
    variables.appendChild(button);
  }

  const safety = makeEl("p", "al-library-export-description", libraryExportText("templateSafety"));
  styleDescription(safety);
  const error = makeEl("p", "al-library-export-template-error");
  error.setAttribute("role", "alert");
  error.setAttribute("aria-live", "polite");
  Object.assign(error.style, {
    margin: "8px 0 0",
    color: "var(--text-error)",
    fontSize: ".65rem",
    lineHeight: "1.45",
    whiteSpace: "pre-line",
  });

  templateSection.append(templateHeading, templateDescription, template, variableLabel, variables, safety, error);
  root.append(formatSection, scopeSection, templateSection);

  const update = (
    nextFormat: LibraryExportFormat,
    nextScope: LibraryExportScope,
    nextTemplate: string,
    nextTemplateIssues: readonly string[],
  ): void => {
    for (const [value, button] of formatButtons) {
      const active = value === nextFormat;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    formatDescription.textContent = libraryExportText(
      nextFormat === "json" ? "jsonDescription" : "textDescription",
    );
    templateSection.hidden = nextFormat !== "text";
    if (media.value !== nextScope.mediaType) media.value = nextScope.mediaType;
    if (status.value !== nextScope.status) status.value = nextScope.status;
    if (template.value !== nextTemplate) template.value = nextTemplate;
    error.textContent = nextTemplateIssues.join("\n");
    error.hidden = nextTemplateIssues.length === 0;
    template.setAttribute("aria-invalid", nextTemplateIssues.length ? "true" : "false");
  };

  update(format, scope, templateValue, templateIssues);
  return { element: root, template, update };
}

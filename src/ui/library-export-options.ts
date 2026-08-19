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

export function renderLibraryExportFormatTabs(
  parent: HTMLElement,
  format: LibraryExportFormat,
  onChange: (format: LibraryExportFormat) => void,
): void {
  const section = makeEl("section", "al-library-export-section");
  section.appendChild(makeEl("strong", "al-library-export-section-title", libraryExportText("format")));
  const tabs = makeEl("div", "al-modal-type-tabs al-library-export-format-tabs");
  for (const value of ["json", "text"] as const) {
    const button = makeEl(
      "button",
      `al-modal-type al-library-export-format${format === value ? " is-active" : ""}`,
      libraryExportText(value),
    );
    button.type = "button";
    button.setAttribute("aria-pressed", format === value ? "true" : "false");
    button.addEventListener("click", () => onChange(value));
    tabs.appendChild(button);
  }
  section.append(
    tabs,
    makeEl(
      "p",
      "al-library-export-description",
      libraryExportText(format === "json" ? "jsonDescription" : "textDescription"),
    ),
  );
  parent.appendChild(section);
}

export function renderLibraryExportScope(
  parent: HTMLElement,
  scope: LibraryExportScope,
  onChange: (scope: LibraryExportScope) => void,
): void {
  const section = makeEl("section", "al-library-export-section");
  section.appendChild(makeEl("strong", "al-library-export-section-title", libraryExportText("scope")));
  const grid = makeEl("div", "al-media-form al-library-export-scope");

  const mediaField = makeEl("label", "al-form-field al-library-export-field");
  mediaField.appendChild(makeEl("span", "al-form-label", libraryExportText("mediaType")));
  const media = makeEl("select");
  appendOption(media, "all", MEDIA_UI_LABELS.type.all);
  for (const type of ["anime", "manga", "novel"] as const) appendOption(media, type, MEDIA_UI_LABELS.type[type]);
  media.value = scope.mediaType;
  media.addEventListener("change", () => onChange({ ...scope, mediaType: media.value as LibraryExportMediaFilter }));
  mediaField.appendChild(media);

  const statusField = makeEl("label", "al-form-field al-library-export-field");
  statusField.appendChild(makeEl("span", "al-form-label", libraryExportText("status")));
  const status = makeEl("select");
  appendOption(status, "all", uiText("media.status.all"));
  for (const value of MEDIA_STATUS_VALUES) appendOption(status, value, uiText(`media.status.${value}`));
  status.value = scope.status;
  status.addEventListener("change", () => onChange({ ...scope, status: status.value as MediaStatusFilter }));
  statusField.appendChild(status);

  grid.append(mediaField, statusField);
  section.appendChild(grid);
  parent.appendChild(section);
}

export function renderLibraryExportTextFields(
  parent: HTMLElement,
  format: LibraryExportFormat,
  selected: ReadonlySet<LibraryTextExportField>,
  onChange: (field: LibraryTextExportField, checked: boolean) => void,
): void {
  if (format !== "text") return;
  const section = makeEl("section", "al-library-export-section");
  section.append(
    makeEl("strong", "al-library-export-section-title", libraryExportText("fields")),
    makeEl("p", "al-library-export-description", libraryExportText("requiredFields")),
  );
  const fields = makeEl("div", "al-media-form al-library-export-fields");
  for (const field of LIBRARY_TEXT_EXPORT_FIELDS) {
    const label = makeEl("label", "al-form-checkbox al-library-export-checkbox");
    const input = makeEl("input");
    input.type = "checkbox";
    input.checked = selected.has(field);
    input.addEventListener("change", () => onChange(field, input.checked));
    label.append(input, makeEl("span", "", libraryTextFieldLabel(field)));
    fields.appendChild(label);
  }
  section.appendChild(fields);
  parent.appendChild(section);
}

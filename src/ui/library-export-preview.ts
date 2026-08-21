import type { LibraryExportFormat } from "../domain/library-export";
import { libraryExportText } from "../features/library-export/text";
import { makeEl } from "./ui-helpers";

export interface LibraryExportOutput {
  content: string;
  count: number;
}

export interface LibraryExportPreviewView {
  element: HTMLElement;
  textarea: HTMLTextAreaElement;
  update(format: LibraryExportFormat, output: LibraryExportOutput): void;
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

export function createLibraryExportPreview(
  format: LibraryExportFormat,
  output: LibraryExportOutput,
): LibraryExportPreviewView {
  const section = makeEl("section", "al-library-export-card al-library-export-preview-section");
  Object.assign(section.style, {
    display: "flex",
    minWidth: "0",
    minHeight: "360px",
    flexDirection: "column",
    padding: "15px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "12px",
    background: "color-mix(in srgb, var(--background-secondary) 82%, transparent)",
  });
  const heading = makeEl("div", "al-library-export-preview-heading");
  Object.assign(heading.style, {
    display: "flex",
    flexWrap: "wrap",
    minWidth: "0",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "6px 12px",
    marginBottom: "10px",
  });
  const title = makeEl("strong", "al-library-export-section-title", libraryExportText("preview"));
  Object.assign(title.style, { color: "var(--text-normal)", fontSize: ".76rem", fontWeight: "720" });
  const count = makeEl("span", "al-library-export-count");
  Object.assign(count.style, {
    overflow: "hidden",
    color: "var(--text-faint)",
    fontSize: ".64rem",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  });
  heading.append(title, count);

  const text = makeEl("textarea", "al-library-export-preview");
  Object.assign(text.style, {
    width: "100%",
    minWidth: "0",
    minHeight: "min(370px, 42dvh)",
    flex: "1 1 auto",
    resize: "vertical",
    padding: "12px 13px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "9px",
    background: "var(--background-primary)",
    color: "var(--text-normal)",
    fontFamily: "var(--font-monospace)",
    fontSize: ".7rem",
    lineHeight: "1.55",
    tabSize: "2",
    boxSizing: "border-box",
  });
  text.readOnly = true;
  text.spellcheck = false;
  text.setAttribute("aria-label", libraryExportText("preview"));
  const note = makeEl("p", "al-library-export-preview-note", libraryExportText("previewTruncated"));
  Object.assign(note.style, {
    margin: "8px 0 0",
    color: "var(--text-faint)",
    fontSize: ".63rem",
    lineHeight: "1.4",
  });
  section.append(heading, text, note);

  const update = (nextFormat: LibraryExportFormat, nextOutput: LibraryExportOutput): void => {
    count.textContent = libraryExportText(
      nextFormat === "json" ? "jsonSummary" : "textSummary",
      { count: nextOutput.count },
    );
    const preview = previewText(nextOutput.content);
    if (text.value !== preview.text) text.value = preview.text;
    note.hidden = !preview.truncated;
  };

  update(format, output);
  return { element: section, textarea: text, update };
}

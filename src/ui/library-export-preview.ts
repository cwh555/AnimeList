import type { LibraryExportFormat } from "../domain/library-export";
import { libraryExportText } from "../features/library-export/text";
import { makeEl } from "./ui-helpers";

export interface LibraryExportOutput {
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

export function renderLibraryExportPreview(
  parent: HTMLElement,
  format: LibraryExportFormat,
  output: LibraryExportOutput,
): void {
  const section = makeEl("section", "al-library-export-section al-library-export-preview-section");
  const heading = makeEl("div", "al-library-export-preview-heading");
  heading.append(
    makeEl("strong", "al-library-export-section-title", libraryExportText("preview")),
    makeEl(
      "span",
      "al-library-export-count",
      libraryExportText(format === "json" ? "jsonSummary" : "textSummary", { count: output.count }),
    ),
  );
  const preview = previewText(output.content);
  const text = makeEl("textarea", "al-library-export-preview");
  text.readOnly = true;
  text.spellcheck = false;
  text.rows = 14;
  text.setCssStyles({ boxSizing: "border-box", width: "100%" });
  text.value = preview.text;
  text.setAttribute("aria-label", libraryExportText("preview"));
  section.append(heading, text);
  if (preview.truncated) {
    section.appendChild(makeEl("p", "al-library-export-preview-note", libraryExportText("previewTruncated")));
  }
  parent.appendChild(section);
}

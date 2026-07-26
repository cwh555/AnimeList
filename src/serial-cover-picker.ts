import type { RankedSerialCoverCandidate } from "./serial-entry-cover";

export interface SerialCoverCandidateRowOptions {
  selected: boolean;
  selectLabel: string;
  matchLabel: string;
  onSelect: () => void;
}

function selectFromKeyboard(event: KeyboardEvent, onSelect: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect();
}

export function renderSerialCoverCandidateRow(
  container: HTMLElement,
  candidate: RankedSerialCoverCandidate,
  options: SerialCoverCandidateRowOptions,
): HTMLElement {
  const row = container.createDiv({
    cls: `al-search-result${options.selected ? " is-selected" : ""}`,
  });
  row.dataset.sourceId = candidate.sourceId;
  row.tabIndex = 0;
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", options.selected ? "true" : "false");

  const image = row.createEl("img");
  image.src = candidate.coverUrl;
  image.alt = candidate.title;
  image.loading = "lazy";

  const body = row.createDiv({ cls: "al-search-result-body" });
  body.createEl("strong", { text: candidate.title });
  body.createSpan({ text: candidate.provider });
  body.createSpan({ text: options.matchLabel });

  const selectButton = row.createEl("button", {
    cls: "al-search-result-use",
    text: options.selectLabel,
  });
  selectButton.type = "button";
  selectButton.setAttribute("aria-pressed", options.selected ? "true" : "false");
  selectButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onSelect();
  });

  row.addEventListener("click", (event) => {
    if (event.target === selectButton) return;
    options.onSelect();
  });
  row.addEventListener("keydown", (event) => selectFromKeyboard(event, options.onSelect));
  return row;
}

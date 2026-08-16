import type { RankedSerialCoverCandidate } from "../../domain/serial-covers/ranking";

export interface SerialCoverCandidateRowOptions {
  disabled: boolean;
  applying: boolean;
  matchLabel: string;
  onChoose: () => void;
}

export function renderSerialCoverCandidateRow(
  container: HTMLElement,
  candidate: RankedSerialCoverCandidate,
  options: SerialCoverCandidateRowOptions,
): HTMLButtonElement {
  const row = container.createEl("button", {
    cls: `al-search-result${options.applying ? " is-applying" : ""}`,
  });
  row.type = "button";
  row.disabled = options.disabled;
  row.dataset.sourceId = candidate.sourceId;
  row.setAttribute("aria-busy", options.applying ? "true" : "false");

  const image = row.createEl("img");
  image.src = candidate.coverUrl;
  image.alt = "";
  image.loading = "lazy";

  const body = row.createDiv({ cls: "al-search-result-body" });
  body.createEl("strong", { text: candidate.title });
  body.createSpan({ text: candidate.provider });
  body.createSpan({ text: options.matchLabel });

  row.addEventListener("click", options.onChoose);
  return row;
}

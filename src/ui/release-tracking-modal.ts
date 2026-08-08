import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import type {
  ReleaseMatchCandidate,
  ReleaseRefreshItemResult,
  ReleaseRefreshSummary,
  ReleaseTrackingService,
} from "../data/release-tracking-service";
import { releaseTrackingText } from "../release-tracking-text";

export interface ReleaseTrackingModalActions {
  openMedia(path: string): Promise<void> | void;
  reviewItem(item: MediaItem): void;
}

function makeElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = createEl(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function providerLabel(provider: ReleaseRefreshItemResult["provider"]): string {
  return provider === "mangadex"
    ? releaseTrackingText("provider.mangadex")
    : provider === "ndl-jpro"
      ? releaseTrackingText("provider.ndl")
      : "";
}

function statusLabel(status: ReleaseRefreshItemResult["status"]): string {
  if (status === "ambiguous") return releaseTrackingText("status.ambiguous");
  if (status === "unmatched") return releaseTrackingText("status.unmatched");
  if (status === "provider_error") return releaseTrackingText("status.provider_error");
  if (status === "source_regressed") return releaseTrackingText("status.source_regressed");
  return releaseTrackingText("status.unconfigured");
}

function releaseChangeText(result: ReleaseRefreshItemResult): string {
  const prefix = result.item.mediaType === "manga" ? "Ch." : "Vol.";
  if (!result.before) return `${prefix}${result.after}`;
  return `${prefix}${result.before} → ${prefix}${result.after}`;
}

function summaryStat(label: string): HTMLElement {
  const node = makeElement("div", "al-stat");
  node.append(makeElement("strong", "al-stat-number", label));
  return node;
}

function resultRow(result: ReleaseRefreshItemResult, actions: ReleaseTrackingModalActions): HTMLElement {
  const row = makeElement("div", "al-search-result");
  const marker = makeElement("div", "al-search-result-placeholder");
  const icon = makeElement("span");
  setIcon(icon, result.kind === "attention" ? "triangle-alert" : result.kind === "updated" ? "arrow-up" : "check");
  marker.appendChild(icon);

  const copy = makeElement("div", "al-search-result-body");
  copy.appendChild(makeElement("strong", "", result.item.title));
  copy.appendChild(makeElement(
    "span",
    "",
    result.kind === "attention" ? (result.message || statusLabel(result.status)) : releaseChangeText(result),
  ));
  const provider = providerLabel(result.provider);
  if (provider) copy.appendChild(makeElement("span", "", provider));

  const actionsEl = makeElement("div");
  if (result.kind === "attention" && (result.status === "ambiguous" || result.status === "unmatched")) {
    const review = makeElement("button", "al-secondary-button", releaseTrackingText("modal.review"));
    review.type = "button";
    review.addEventListener("click", () => actions.reviewItem(result.item));
    actionsEl.appendChild(review);
  } else {
    const open = makeElement("button", "al-secondary-button", releaseTrackingText("modal.open"));
    open.type = "button";
    open.addEventListener("click", () => { void actions.openMedia(result.item.filePath); });
    actionsEl.appendChild(open);
  }
  row.append(marker, copy, actionsEl);
  return row;
}

function appendResultSection(
  parent: HTMLElement,
  heading: string,
  results: ReleaseRefreshItemResult[],
  actions: ReleaseTrackingModalActions,
): void {
  if (!results.length) return;
  parent.appendChild(makeElement("h3", "", `${heading} (${results.length})`));
  const rows = makeElement("div", "al-search-results");
  results.forEach((result) => rows.appendChild(resultRow(result, actions)));
  parent.appendChild(rows);
}

export class ReleaseTrackingResultsModal extends Modal {
  constructor(app: App, private readonly summary: ReleaseRefreshSummary, private readonly actions: ReleaseTrackingModalActions) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-release-results-modal");
    this.contentEl.replaceChildren();

    const heading = makeElement("div", "al-modal-heading");
    const copy = makeElement("div");
    copy.append(
      makeElement("h2", "", releaseTrackingText("modal.title")),
      makeElement("p", "", releaseTrackingText("modal.checkedAt", { time: new Date().toLocaleString() })),
    );
    heading.appendChild(copy);
    this.contentEl.appendChild(heading);

    const stats = makeElement("div", "al-stats");
    stats.append(
      summaryStat(releaseTrackingText("modal.summaryUpdated", { count: this.summary.updated })),
      summaryStat(releaseTrackingText("modal.summaryUnchanged", { count: this.summary.unchanged })),
      summaryStat(releaseTrackingText("modal.summaryAttention", { count: this.summary.attention })),
    );
    if (this.summary.initialized > 0) {
      stats.appendChild(summaryStat(releaseTrackingText("modal.summaryInitialized", { count: this.summary.initialized })));
    }
    this.contentEl.appendChild(stats);

    appendResultSection(this.contentEl, releaseTrackingText("modal.updatedHeading"), this.summary.results.filter((r) => r.kind === "updated"), this.actions);
    appendResultSection(this.contentEl, releaseTrackingText("modal.initializedHeading"), this.summary.results.filter((r) => r.kind === "initialized"), this.actions);
    appendResultSection(this.contentEl, releaseTrackingText("modal.attentionHeading"), this.summary.results.filter((r) => r.kind === "attention"), this.actions);

    if (this.summary.unchanged > 0) {
      this.contentEl.appendChild(makeElement(
        "div",
        "al-modal-warning",
        releaseTrackingText("modal.unchangedHeading", { count: this.summary.unchanged }),
      ));
    }

    const footer = makeElement("div", "al-modal-actions");
    const close = makeElement("button", "mod-cta", releaseTrackingText("modal.close"));
    close.type = "button";
    close.addEventListener("click", () => this.close());
    footer.appendChild(close);
    this.contentEl.append(
      makeElement("p", "al-modal-hint", releaseTrackingText("modal.note")),
      footer,
    );
  }
}

export interface ReleaseTrackingMatchModalOptions {
  onResolved(result: ReleaseRefreshItemResult): Promise<void> | void;
  onDisabled(): Promise<void> | void;
}

function candidateRow(
  candidate: ReleaseMatchCandidate,
  onUse: (candidate: ReleaseMatchCandidate, button: HTMLButtonElement) => void,
): HTMLElement {
  const row = makeElement("div", "al-search-result");
  const placeholder = makeElement("div", "al-search-result-placeholder", candidate.provider === "mangadex" ? "MD" : "NDL");
  const copy = makeElement("div", "al-search-result-body");
  copy.appendChild(makeElement("strong", "", candidate.label));
  if (candidate.description) copy.appendChild(makeElement("span", "", candidate.description));
  copy.appendChild(makeElement("span", "", candidate.provider === "mangadex" ? releaseTrackingText("provider.mangadex") : releaseTrackingText("provider.ndl")));
  const use = makeElement("button", "al-secondary-button", releaseTrackingText("match.use"));
  use.type = "button";
  use.addEventListener("click", () => onUse(candidate, use));
  row.append(placeholder, copy, use);
  return row;
}

export class ReleaseTrackingMatchModal extends Modal {
  private requestId = 0;

  constructor(app: App, private readonly service: ReleaseTrackingService, private readonly item: MediaItem, private readonly options: ReleaseTrackingMatchModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-release-match-modal");
    void this.renderCandidates();
  }

  private async renderCandidates(): Promise<void> {
    const requestId = ++this.requestId;
    this.contentEl.replaceChildren();
    const heading = makeElement("div", "al-modal-heading");
    const copy = makeElement("div");
    copy.append(
      makeElement("h2", "", releaseTrackingText("match.title")),
      makeElement("p", "", releaseTrackingText("match.description")),
    );
    heading.appendChild(copy);
    this.contentEl.append(heading, makeElement("div", "al-modal-hint", releaseTrackingText("match.loading")));

    let candidates: ReleaseMatchCandidate[] = [];
    try { candidates = await this.service.matchCandidates(this.item); } catch { candidates = []; }
    if (requestId !== this.requestId) return;

    this.contentEl.querySelector(".al-modal-hint")?.remove();
    const rows = makeElement("div", "al-search-results");
    if (!candidates.length) rows.appendChild(makeElement("div", "al-search-empty", releaseTrackingText("match.empty")));
    for (const candidate of candidates) {
      rows.appendChild(candidateRow(candidate, (selected, button) => {
        button.disabled = true;
        void (async () => {
          await this.service.state.writeBinding(this.item.filePath, this.item.mediaType, selected.binding);
          const result = await this.service.refreshItem(this.item, selected.binding);
          await this.options.onResolved(result);
          this.close();
        })().finally(() => { button.disabled = false; });
      }));
    }
    this.contentEl.appendChild(rows);

    const footer = makeElement("div", "al-modal-actions");
    const disable = makeElement("button", "al-secondary-button", releaseTrackingText("match.disable"));
    disable.type = "button";
    disable.addEventListener("click", () => {
      disable.disabled = true;
      void (async () => {
        await this.service.state.disable(this.item.filePath, this.item.mediaType);
        await this.options.onDisabled();
        this.close();
      })().finally(() => { disable.disabled = false; });
    });
    footer.appendChild(disable);
    this.contentEl.appendChild(footer);
  }
}

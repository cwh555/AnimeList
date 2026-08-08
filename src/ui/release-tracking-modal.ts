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
import { MEDIA_UI_LABELS } from "./ui-helpers";

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

function icon(name: string, className = ""): HTMLElement {
  const node = makeElement("span", className);
  setIcon(node, name);
  return node;
}

function providerLabel(provider: ReleaseRefreshItemResult["provider"]): string {
  return provider === "mangadex"
    ? releaseTrackingText("provider.mangadex")
    : provider === "ndl-jpro"
      ? releaseTrackingText("provider.ndl")
      : "";
}

function mediaTypeLabel(item: MediaItem): string {
  return MEDIA_UI_LABELS.type[item.mediaType];
}

function statusLabel(status: ReleaseRefreshItemResult["status"]): string {
  if (status === "ambiguous") return releaseTrackingText("status.ambiguous");
  if (status === "unmatched") return releaseTrackingText("status.unmatched");
  if (status === "provider_error") return releaseTrackingText("status.provider_error");
  if (status === "source_regressed") return releaseTrackingText("status.source_regressed");
  return releaseTrackingText("status.unconfigured");
}

function releaseValue(result: ReleaseRefreshItemResult, value: string): string {
  const prefix = result.item.mediaType === "manga" ? "Ch." : "Vol.";
  return value ? `${prefix}${value}` : "—";
}

function summaryCard(kind: "updated" | "unchanged" | "attention", count: number, label: string): HTMLElement {
  const card = makeElement("div", `al-release-summary-card is-${kind}`);
  const badge = icon(kind === "updated" ? "circle-check" : kind === "attention" ? "triangle-alert" : "check", "al-release-summary-icon");
  const copy = makeElement("div", "al-release-summary-copy");
  copy.append(makeElement("strong", "al-release-summary-count", String(count)), makeElement("span", "al-release-summary-label", label));
  card.append(badge, copy);
  return card;
}

function rowAction(result: ReleaseRefreshItemResult, actions: ReleaseTrackingModalActions): HTMLButtonElement {
  const needsReview = result.kind === "attention" && (result.status === "ambiguous" || result.status === "unmatched");
  const button = makeElement("button", needsReview ? "mod-cta" : "al-secondary-button", needsReview ? releaseTrackingText("modal.review") : releaseTrackingText("modal.open"));
  button.type = "button";
  button.addEventListener("click", () => {
    if (needsReview) actions.reviewItem(result.item);
    else void actions.openMedia(result.item.filePath);
  });
  return button;
}

function resultRow(result: ReleaseRefreshItemResult, actions: ReleaseTrackingModalActions): HTMLElement {
  const attention = result.kind === "attention";
  const row = makeElement("div", `al-release-result-row${attention ? " is-attention" : ""}`);
  const leading = makeElement("div", "al-release-result-leading");
  leading.appendChild(icon(attention ? "triangle-alert" : result.kind === "updated" ? "arrow-up-right" : "check", "al-release-result-icon"));

  const main = makeElement("div", "al-release-result-main");
  const titleLine = makeElement("div", "al-release-result-title-line");
  titleLine.append(makeElement("strong", "al-release-result-title", result.item.title), makeElement("span", "al-release-media-chip", mediaTypeLabel(result.item)));
  main.appendChild(titleLine);

  if (attention) {
    main.appendChild(makeElement("div", "al-release-result-message", result.message || statusLabel(result.status)));
    const meta = makeElement("div", "al-release-result-meta");
    meta.append(makeElement("span", "al-release-status-chip", statusLabel(result.status)));
    const provider = providerLabel(result.provider);
    if (provider) meta.append(makeElement("span", "al-release-provider-label", provider));
    main.appendChild(meta);
  } else {
    const change = makeElement("div", "al-release-change");
    if (result.before) {
      change.append(
        makeElement("span", "al-release-value-before", releaseValue(result, result.before)),
        icon("arrow-right", "al-release-change-arrow"),
      );
    }
    change.appendChild(makeElement("strong", "al-release-value-after", releaseValue(result, result.after)));
    main.appendChild(change);
    const provider = providerLabel(result.provider);
    if (provider) main.appendChild(makeElement("div", "al-release-provider-label", provider));
  }

  row.append(leading, main, rowAction(result, actions));
  return row;
}

function resultSection(
  index: number,
  kind: "updated" | "initialized" | "attention",
  heading: string,
  results: ReleaseRefreshItemResult[],
  actions: ReleaseTrackingModalActions,
): HTMLElement | null {
  if (!results.length) return null;
  const section = makeElement("section", `al-release-section is-${kind}`);
  const header = makeElement("div", "al-release-section-header");
  header.append(
    makeElement("span", "al-release-section-index", String(index)),
    icon(kind === "attention" ? "triangle-alert" : kind === "updated" ? "sparkles" : "circle-check", "al-release-section-icon"),
    makeElement("h3", "al-release-section-title", heading),
    makeElement("span", "al-release-section-count", String(results.length)),
  );
  const rows = makeElement("div", "al-release-result-list");
  results.forEach((result) => rows.appendChild(resultRow(result, actions)));
  section.append(header, rows);
  return section;
}

function unchangedSection(results: ReleaseRefreshItemResult[], count: number): HTMLDetailsElement | null {
  if (!count) return null;
  const details = makeElement("details", "al-release-unchanged");
  const summary = makeElement("summary", "al-release-unchanged-summary");
  summary.append(icon("chevron-right", "al-release-unchanged-chevron"), icon("check", "al-release-unchanged-icon"), makeElement("span", "", releaseTrackingText("modal.unchangedHeading", { count })));
  const list = makeElement("div", "al-release-unchanged-list");
  results.slice(0, 30).forEach((result) => {
    const line = makeElement("div", "al-release-unchanged-row");
    line.append(makeElement("span", "", result.item.title), makeElement("span", "", releaseValue(result, result.after)));
    list.appendChild(line);
  });
  details.append(summary, list);
  return details;
}

export class ReleaseTrackingResultsModal extends Modal {
  constructor(app: App, private readonly summary: ReleaseRefreshSummary, private readonly actions: ReleaseTrackingModalActions) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-release-results-modal");
    this.contentEl.replaceChildren();

    const header = makeElement("header", "al-release-results-header");
    const mark = makeElement("div", "al-release-results-mark");
    mark.appendChild(icon("refresh-cw"));
    const copy = makeElement("div", "al-release-results-heading-copy");
    copy.append(
      makeElement("h2", "", releaseTrackingText("modal.title")),
      makeElement("p", "", releaseTrackingText("modal.checkedAt", { time: new Date().toLocaleString() })),
    );
    header.append(mark, copy);
    this.contentEl.appendChild(header);

    const stats = makeElement("div", "al-release-summary-grid");
    stats.append(
      summaryCard("updated", this.summary.updated, releaseTrackingText("modal.summaryUpdated", { count: this.summary.updated }).replace(String(this.summary.updated), "").trim()),
      summaryCard("unchanged", this.summary.unchanged, releaseTrackingText("modal.summaryUnchanged", { count: this.summary.unchanged }).replace(String(this.summary.unchanged), "").trim()),
      summaryCard("attention", this.summary.attention, releaseTrackingText("modal.summaryAttention", { count: this.summary.attention }).replace(String(this.summary.attention), "").trim()),
    );
    this.contentEl.appendChild(stats);

    const updated = this.summary.results.filter((result) => result.kind === "updated");
    const initialized = this.summary.results.filter((result) => result.kind === "initialized");
    const attention = this.summary.results.filter((result) => result.kind === "attention");
    const unchanged = this.summary.results.filter((result) => result.kind === "unchanged");
    const content = makeElement("div", "al-release-results-content");
    let sectionIndex = 1;
    const updatedSection = resultSection(sectionIndex, "updated", releaseTrackingText("modal.updatedHeading"), updated, this.actions);
    if (updatedSection) { content.appendChild(updatedSection); sectionIndex += 1; }
    const initializedSection = resultSection(sectionIndex, "initialized", releaseTrackingText("modal.initializedHeading"), initialized, this.actions);
    if (initializedSection) { content.appendChild(initializedSection); sectionIndex += 1; }
    const attentionSection = resultSection(sectionIndex, "attention", releaseTrackingText("modal.attentionHeading"), attention, this.actions);
    if (attentionSection) { attentionSection.id = "al-release-attention-section"; content.appendChild(attentionSection); sectionIndex += 1; }
    const unchangedNode = unchangedSection(unchanged, this.summary.unchanged);
    if (unchangedNode) content.appendChild(unchangedNode);
    this.contentEl.appendChild(content);

    const footer = makeElement("footer", "al-release-results-footer");
    const note = makeElement("div", "al-release-footer-note");
    note.append(icon("shield-check"), makeElement("span", "", releaseTrackingText("modal.note")));
    const actions = makeElement("div", "al-release-footer-actions");
    const close = makeElement("button", "al-secondary-button", releaseTrackingText("modal.close"));
    close.type = "button";
    close.addEventListener("click", () => this.close());
    actions.appendChild(close);
    if (this.summary.attention > 0) {
      const review = makeElement("button", "mod-cta", releaseTrackingText("modal.attentionHeading"));
      review.type = "button";
      review.addEventListener("click", () => this.contentEl.querySelector("#al-release-attention-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      actions.appendChild(review);
    }
    footer.append(note, actions);
    this.contentEl.appendChild(footer);
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
  const row = makeElement("div", "al-release-match-card");
  const provider = makeElement("div", "al-release-match-provider", candidate.provider === "mangadex" ? "MD" : "NDL");
  const copy = makeElement("div", "al-release-match-copy");
  copy.appendChild(makeElement("strong", "", candidate.label));
  if (candidate.description) copy.appendChild(makeElement("span", "", candidate.description));
  copy.appendChild(makeElement("small", "", candidate.provider === "mangadex" ? releaseTrackingText("provider.mangadex") : releaseTrackingText("provider.ndl")));
  const use = makeElement("button", "mod-cta", releaseTrackingText("match.use"));
  use.type = "button";
  use.addEventListener("click", () => onUse(candidate, use));
  row.append(provider, copy, use);
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
    const heading = makeElement("div", "al-release-match-heading");
    heading.append(
      icon("search-check", "al-release-match-heading-icon"),
      makeElement("div", "", ""),
    );
    const headingCopy = heading.lastElementChild as HTMLElement;
    headingCopy.append(makeElement("h2", "", releaseTrackingText("match.title")), makeElement("p", "", releaseTrackingText("match.description")));
    this.contentEl.append(heading, makeElement("div", "al-release-match-loading", releaseTrackingText("match.loading")));

    let candidates: ReleaseMatchCandidate[] = [];
    try { candidates = await this.service.matchCandidates(this.item); } catch { candidates = []; }
    if (requestId !== this.requestId) return;

    this.contentEl.querySelector(".al-release-match-loading")?.remove();
    const rows = makeElement("div", "al-release-match-list");
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

    const footer = makeElement("div", "al-release-match-actions");
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

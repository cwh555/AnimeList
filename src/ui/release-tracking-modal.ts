import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { MediaItem } from "../domain/media-types";
import type {
  ReleaseMatchCandidate,
  ReleaseRefreshItemResult,
  ReleaseRefreshProgress,
  ReleaseRefreshSummary,
  ReleaseTrackingService,
} from "../data/release-tracking-service";
import { releaseTrackingText } from "../features/release-tracking/text";
import { abortable, isOperationCancelled } from "../domain/abort";
import { MEDIA_UI_LABELS } from "./ui-helpers";
import { bindImageFallback } from "./image-fallback";
import { transitionSurface } from "./layout-motion";

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

function providerLabel(provider: ReleaseRefreshItemResult["provider"] | ReleaseRefreshProgress["provider"]): string {
  return provider === "manga"
    ? releaseTrackingText("provider.manga")
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

function readingProgress(item: MediaItem): string {
  const value = String(item.progress ?? "").trim();
  if (!value) return "—";
  if (item.mediaType === "manga") return `Ch.${value}`;
  if (item.mediaType === "novel") return `Vol.${value}`;
  return value;
}

function resultCover(item: MediaItem, className = "al-release-result-cover"): HTMLElement {
  const cover = makeElement("div", className);
  const source = item.coverSources?.src || item.cover;
  if (!source) {
    cover.appendChild(icon("book-open", "al-release-cover-fallback"));
    return cover;
  }
  const image = makeElement("img");
  image.alt = item.title;
  image.loading = "lazy";
  image.decoding = "async";
  bindImageFallback(image, () => icon("book-open", "al-release-cover-fallback"));
  if (item.coverSources?.srcset) image.srcset = item.coverSources.srcset;
  cover.appendChild(image);
  image.src = source;
  return cover;
}

function summaryCard(kind: "updated" | "unchanged" | "attention", count: number, label: string, description: string): HTMLElement {
  const card = makeElement("div", `al-release-summary-card is-${kind}`);
  const badge = icon(kind === "updated" ? "arrow-up" : kind === "attention" ? "triangle-alert" : "list", "al-release-summary-icon");
  const copy = makeElement("div", "al-release-summary-copy");
  const headline = makeElement("div", "al-release-summary-headline");
  headline.append(makeElement("strong", "al-release-summary-count", String(count)), makeElement("span", "al-release-summary-label", label));
  copy.append(headline, makeElement("small", "al-release-summary-description", description));
  card.append(badge, copy);
  return card;
}

function rowAction(result: ReleaseRefreshItemResult, actions: ReleaseTrackingModalActions): HTMLButtonElement {
  const needsReview = result.kind === "attention" && (result.status === "ambiguous" || result.status === "unmatched");
  const button = makeElement(
    "button",
    needsReview ? "mod-cta al-release-row-action" : "al-secondary-button al-release-row-action",
  );
  button.type = "button";
  button.append(
    makeElement("span", "", needsReview ? releaseTrackingText("modal.review") : releaseTrackingText("modal.open")),
    icon("chevron-right", "al-release-row-action-icon"),
  );
  button.addEventListener("click", () => {
    if (needsReview) actions.reviewItem(result.item);
    else void actions.openMedia(result.item.filePath);
  });
  return button;
}

function identityCell(item: MediaItem): HTMLElement {
  const identity = makeElement("div", "al-release-result-identity");
  identity.append(
    makeElement("strong", "al-release-result-title", item.title),
    makeElement("span", "al-release-media-chip", mediaTypeLabel(item)),
  );
  return identity;
}

function labeledCell(label: string, className = ""): HTMLElement {
  const cell = makeElement("div", `al-release-result-cell${className ? ` ${className}` : ""}`);
  cell.appendChild(makeElement("span", "al-release-result-cell-label", label));
  return cell;
}

function resultRow(result: ReleaseRefreshItemResult, actions: ReleaseTrackingModalActions): HTMLElement {
  const attention = result.kind === "attention";
  const row = makeElement("div", `al-release-result-row${attention ? " is-attention" : ""}`);

  const progressCell = labeledCell(releaseTrackingText("modal.columnProgress"), "al-release-progress-cell");
  progressCell.appendChild(makeElement("strong", "al-release-reading-progress", readingProgress(result.item)));

  const changeCell = labeledCell(releaseTrackingText("modal.columnChange"), "al-release-change-cell");
  if (attention) {
    changeCell.appendChild(makeElement("div", "al-release-result-message", result.message || statusLabel(result.status)));
  } else {
    const change = makeElement("div", "al-release-change");
    if (result.before) {
      change.append(
        makeElement("span", "al-release-value-before", releaseValue(result, result.before)),
        icon("arrow-right", "al-release-change-arrow"),
      );
    }
    change.appendChild(makeElement("strong", "al-release-value-after", releaseValue(result, result.after)));
    changeCell.appendChild(change);
  }
  if (result.notes.length) {
    const notes = makeElement("div", "al-release-result-notes");
    notes.appendChild(makeElement("span", "al-release-result-notes-label", `${releaseTrackingText("modal.notes")}:`));
    for (const note of result.notes) notes.appendChild(makeElement("span", "al-release-result-note", note));
    changeCell.appendChild(notes);
  }

  const sourceCell = labeledCell(releaseTrackingText("modal.columnSource"), "al-release-source-cell");
  if (attention) sourceCell.appendChild(makeElement("span", "al-release-status-chip", statusLabel(result.status)));
  const provider = result.sourceLabel || providerLabel(result.provider);
  if (provider) sourceCell.appendChild(makeElement("span", "al-release-provider-label", provider));

  row.append(
    resultCover(result.item),
    identityCell(result.item),
    progressCell,
    changeCell,
    sourceCell,
    rowAction(result, actions),
  );
  return row;
}

function resultSection(
  index: number,
  kind: "updated" | "initialized" | "attention" | "unchanged",
  heading: string,
  results: ReleaseRefreshItemResult[],
  actions: ReleaseTrackingModalActions,
): HTMLElement | null {
  if (!results.length) return null;
  const section = makeElement("section", `al-release-section is-${kind}`);
  const header = makeElement("div", "al-release-section-header");
  const iconName = kind === "attention" ? "triangle-alert" : kind === "unchanged" ? "circle-minus" : "circle-check";
  header.append(
    icon(iconName, "al-release-section-icon"),
    makeElement("span", "al-release-section-index", `${index}.`),
    makeElement("h3", "al-release-section-title", heading),
    makeElement("span", "al-release-section-count", `(${results.length})`),
  );
  const body = makeElement("div", "al-release-section-body");
  results.forEach((result) => body.appendChild(resultRow(result, actions)));
  section.append(header, body);
  return section;
}

export class ReleaseTrackingResultsModal extends Modal {
  private summary: ReleaseRefreshSummary | null = null;
  private progress: ReleaseRefreshProgress | null = null;
  private busy = true;
  private opened = false;

  constructor(app: App, private readonly actions: ReleaseTrackingModalActions) {
    super(app);
  }

  onOpen(): void {
    this.opened = true;
    this.modalEl.classList.add("animelist-modal", "animelist-release-results-modal", "is-running");
    this.render();
  }

  onClose(): void {
    this.opened = false;
  }

  close(): void {
    super.close();
  }

  showProgress(progress: ReleaseRefreshProgress): void {
    this.progress = progress;
    if (this.opened && this.busy && !this.updateRunningProgress()) this.renderRunning();
  }

  showResults(summary: ReleaseRefreshSummary): void {
    this.summary = summary;
    this.busy = false;
    this.modalEl.classList.remove("is-running");
    if (this.opened) this.renderResults();
  }

  showFailure(message: string): void {
    this.busy = false;
    this.modalEl.classList.remove("is-running");
    if (this.opened) this.renderFailure(message);
  }

  private render(): void {
    if (this.summary) this.renderResults();
    else this.renderRunning();
  }

  private appendHeader(title: string, description: string, running = false): void {
    const header = makeElement("header", "al-release-results-header");
    const mark = makeElement("div", `al-release-results-mark${running ? " is-spinning" : ""}`);
    mark.appendChild(icon("refresh-cw"));
    const copy = makeElement("div", "al-release-results-heading-copy");
    copy.append(makeElement("h2", "", title));
    if (description) copy.append(makeElement("p", "", description));
    header.append(mark, copy);
    this.contentEl.appendChild(header);
  }

  private updateRunningProgress(): boolean {
    const body = this.contentEl.querySelector<HTMLElement>(".al-release-running");
    if (!body) return false;
    const progress = this.progress;
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? 0;
    const count = body.querySelector<HTMLElement>(".al-release-running-head span");
    const fill = body.querySelector<HTMLElement>(".al-release-running-fill");
    if (count) count.textContent = releaseTrackingText("modal.runningProgress", { completed, total });
    if (fill) fill.style.width = total > 0 ? `${Math.min(100, Math.max(0, completed / total * 100))}%` : "0%";

    const current = body.querySelector<HTMLElement>(".al-release-running-item, .al-release-running-preparing");
    const nextPath = progress?.item.filePath ?? "";
    if (current?.dataset.filePath === nextPath || (!progress && current?.classList.contains("al-release-running-preparing"))) {
      return true;
    }
    const replacement = progress
      ? (() => {
        const item = makeElement("div", "al-release-running-item");
        item.dataset.filePath = progress.item.filePath;
        const copy = makeElement("div", "al-release-running-item-copy");
        copy.append(
          makeElement("strong", "", progress.item.title),
          makeElement("span", "al-release-media-chip", mediaTypeLabel(progress.item)),
        );
        item.append(
          resultCover(progress.item, "al-release-running-cover"),
          copy,
          makeElement("span", "al-release-running-provider", providerLabel(progress.provider)),
        );
        return item;
      })()
      : (() => {
        const preparing = makeElement("div", "al-release-running-preparing");
        preparing.dataset.filePath = "";
        preparing.append(icon("loader-circle"), makeElement("span", "", releaseTrackingText("modal.runningPreparing")));
        return preparing;
      })();
    if (current) current.replaceWith(replacement);
    else body.appendChild(replacement);
    return true;
  }

  private renderRunning(): void {
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    this.appendHeader(
      releaseTrackingText("modal.runningTitle"),
      releaseTrackingText("modal.runningDescription"),
      true,
    );
    const progress = this.progress;
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? 0;
    const body = makeElement("div", "al-release-running");
    const progressHead = makeElement("div", "al-release-running-head");
    progressHead.append(
      makeElement("strong", "", releaseTrackingText("modal.runningCurrent")),
      makeElement("span", "", releaseTrackingText("modal.runningProgress", { completed, total })),
    );
    const track = makeElement("div", "al-release-running-track");
    const fill = makeElement("div", "al-release-running-fill");
    fill.style.width = total > 0 ? `${Math.min(100, Math.max(0, completed / total * 100))}%` : "0%";
    track.appendChild(fill);
    body.append(progressHead, track);

    if (progress) {
      const current = makeElement("div", "al-release-running-item");
      current.dataset.filePath = progress.item.filePath;
      const copy = makeElement("div", "al-release-running-item-copy");
      copy.append(
        makeElement("strong", "", progress.item.title),
        makeElement("span", "al-release-media-chip", mediaTypeLabel(progress.item)),
      );
      current.append(
        resultCover(progress.item, "al-release-running-cover"),
        copy,
        makeElement("span", "al-release-running-provider", providerLabel(progress.provider)),
      );
      body.appendChild(current);
    } else {
      const preparing = makeElement("div", "al-release-running-preparing");
      preparing.append(icon("loader-circle"), makeElement("span", "", releaseTrackingText("modal.runningPreparing")));
      body.appendChild(preparing);
    }
    this.contentEl.appendChild(body);

    const footer = makeElement("footer", "al-release-results-footer is-running");
    const note = makeElement("div", "al-release-footer-note");
    note.append(icon("shield-check"), makeElement("span", "", releaseTrackingText("modal.runningNote")));
    footer.appendChild(note);
    this.contentEl.appendChild(footer);
  }

  private renderResults(): void {
    const summary = this.summary;
    if (!summary) return;
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    this.appendHeader(releaseTrackingText("modal.title"), "");

    const stats = makeElement("div", "al-release-summary-grid");
    stats.append(
      summaryCard(
        "updated",
        summary.updated,
        releaseTrackingText("modal.summaryUpdated", { count: summary.updated }).replace(String(summary.updated), "").trim(),
        releaseTrackingText("modal.summaryUpdatedDescription"),
      ),
      summaryCard(
        "unchanged",
        summary.unchanged,
        releaseTrackingText("modal.summaryUnchanged", { count: summary.unchanged }).replace(String(summary.unchanged), "").trim(),
        releaseTrackingText("modal.summaryUnchangedDescription"),
      ),
      summaryCard(
        "attention",
        summary.attention,
        releaseTrackingText("modal.summaryAttention", { count: summary.attention }).replace(String(summary.attention), "").trim(),
        releaseTrackingText("modal.summaryAttentionDescription"),
      ),
    );
    this.contentEl.appendChild(stats);
    this.contentEl.appendChild(makeElement(
      "div",
      "al-release-checked-at",
      releaseTrackingText("modal.checkedAt", { time: new Date().toLocaleString() }),
    ));

    const updated = summary.results.filter((result) => result.kind === "updated");
    const initialized = summary.results.filter((result) => result.kind === "initialized");
    const attention = summary.results.filter((result) => result.kind === "attention");
    const unchanged = summary.results.filter((result) => result.kind === "unchanged");
    const content = makeElement("div", "al-release-results-content");
    let sectionIndex = 1;
    const updatedSection = resultSection(sectionIndex, "updated", releaseTrackingText("modal.updatedHeading"), updated, this.actions);
    if (updatedSection) { content.appendChild(updatedSection); sectionIndex += 1; }
    const initializedSection = resultSection(sectionIndex, "initialized", releaseTrackingText("modal.initializedHeading"), initialized, this.actions);
    if (initializedSection) { content.appendChild(initializedSection); sectionIndex += 1; }
    const attentionSection = resultSection(sectionIndex, "attention", releaseTrackingText("modal.attentionHeading"), attention, this.actions);
    if (attentionSection) { attentionSection.id = "al-release-attention-section"; content.appendChild(attentionSection); sectionIndex += 1; }
    const unchangedNode = resultSection(sectionIndex, "unchanged", releaseTrackingText("modal.unchangedHeading", { count: summary.unchanged }), unchanged, this.actions);
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
    if (summary.attention > 0) {
      const review = makeElement("button", "mod-cta", releaseTrackingText("modal.attentionHeading"));
      review.type = "button";
      review.addEventListener("click", () => this.contentEl.querySelector("#al-release-attention-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      actions.appendChild(review);
    }
    footer.append(note, actions);
    this.contentEl.appendChild(footer);
  }

  private renderFailure(message: string): void {
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    this.appendHeader(releaseTrackingText("modal.failedTitle"), releaseTrackingText("modal.failedDescription", { message }));
    const failure = makeElement("div", "al-release-failure");
    failure.append(icon("triangle-alert"), makeElement("span", "", message));
    this.contentEl.appendChild(failure);
    const footer = makeElement("footer", "al-release-results-footer");
    const actions = makeElement("div", "al-release-footer-actions");
    const close = makeElement("button", "mod-cta", releaseTrackingText("modal.close"));
    close.type = "button";
    close.addEventListener("click", () => this.close());
    actions.appendChild(close);
    footer.appendChild(actions);
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
  private busy = false;
  private candidates: ReleaseMatchCandidate[] = [];
  private failure = "";
  private requestController: AbortController | null = null;
  private opened = false;

  constructor(app: App, private readonly service: ReleaseTrackingService, private readonly item: MediaItem, private readonly options: ReleaseTrackingMatchModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.opened = true;
    this.modalEl.classList.add("animelist-modal", "animelist-release-match-modal");
    void this.loadCandidates();
  }

  onClose(): void {
    this.opened = false;
    this.requestController?.abort();
    this.requestController = null;
  }

  close(): void {
    this.requestController?.abort();
    super.close();
  }

  private renderHeading(): void {
    const heading = makeElement("div", "al-release-match-heading");
    heading.append(
      icon("search-check", "al-release-match-heading-icon"),
      makeElement("div", "", ""),
    );
    const headingCopy = heading.lastElementChild as HTMLElement;
    headingCopy.append(makeElement("h2", "", releaseTrackingText("match.title")), makeElement("p", "", releaseTrackingText("match.description")));
    this.contentEl.appendChild(heading);
  }

  private async loadCandidates(): Promise<void> {
    const requestId = ++this.requestId;
    this.requestController?.abort();
    const controller = new AbortController();
    this.requestController = controller;
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    this.renderHeading();
    this.contentEl.appendChild(makeElement("div", "al-release-match-loading", releaseTrackingText("match.loading")));

    let candidates: ReleaseMatchCandidate[] = [];
    try {
      candidates = await abortable(this.service.matchCandidates(this.item), controller.signal);
    } catch (error) {
      if (isOperationCancelled(error)) return;
      candidates = [];
    }
    if (!this.opened || controller.signal.aborted || requestId !== this.requestId) return;
    this.candidates = candidates;
    this.failure = "";

    if (candidates.length === 1) {
      this.renderCandidates(candidates, true);
      await this.resolveCandidate(candidates[0], true, controller);
      return;
    }
    this.requestController = null;
    this.renderCandidates(candidates, false);
  }

  private renderCandidates(candidates: ReleaseMatchCandidate[], autoResolving: boolean): void {
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    this.renderHeading();

    if (autoResolving) {
      const single = makeElement("div", "al-release-match-single");
      single.append(icon("sparkles"), makeElement("span", "", releaseTrackingText("match.single")));
      this.contentEl.appendChild(single);
    }
    if (this.failure) {
      const failure = makeElement("div", "al-release-match-failure");
      failure.append(icon("triangle-alert"), makeElement("span", "", releaseTrackingText("match.failed", { message: this.failure })));
      this.contentEl.appendChild(failure);
    }

    const rows = makeElement("div", "al-release-match-list");
    if (!candidates.length) rows.appendChild(makeElement("div", "al-search-empty", releaseTrackingText("match.empty")));
    for (const candidate of candidates) {
      rows.appendChild(candidateRow(candidate, (selected) => { void this.resolveCandidate(selected, false); }));
    }
    this.contentEl.appendChild(rows);

    const footer = makeElement("div", "al-release-match-actions");
    const disable = makeElement("button", "al-secondary-button", releaseTrackingText("match.disable"));
    disable.type = "button";
    disable.disabled = this.busy;
    disable.addEventListener("click", () => { void this.disableTracking(); });
    footer.appendChild(disable);
    this.contentEl.appendChild(footer);

    if (this.busy) this.appendBusyProgress();
    this.setButtonsDisabled(this.busy);
  }

  private appendBusyProgress(): void {
    const progress = makeElement("div", "al-release-match-progress");
    const label = makeElement("div", "al-release-match-progress-label");
    label.append(icon("loader-circle"), makeElement("span", "", releaseTrackingText("match.resolving")));
    const track = makeElement("div", "al-release-match-progress-track");
    track.appendChild(makeElement("div", "al-release-match-progress-fill"));
    progress.append(label, track);
    this.contentEl.appendChild(progress);
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.contentEl.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = disabled; });
  }

  private async resolveCandidate(
    candidate: ReleaseMatchCandidate,
    automatic: boolean,
    existingController: AbortController | null = null,
  ): Promise<void> {
    if (this.busy) return;
    const controller = existingController ?? new AbortController();
    if (!existingController) {
      this.requestController?.abort();
      this.requestController = controller;
    }
    this.busy = true;
    this.failure = "";
    this.modalEl.classList.add("is-busy");
    if (this.opened) this.renderCandidates(this.candidates, automatic);
    try {
      const result = await this.service.refreshItem(this.item, candidate.binding, controller.signal);
      if (!this.opened || controller.signal.aborted) return;
      if (result.status === "verified") {
        this.busy = false;
        this.requestController = null;
        this.modalEl.classList.remove("is-busy");
        await this.options.onResolved(result);
        super.close();
        return;
      }
      this.failure = result.message || statusLabel(result.status);
    } catch (error) {
      if (isOperationCancelled(error)) return;
      this.failure = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.requestController === controller) this.requestController = null;
      if (this.busy) {
        this.busy = false;
        this.modalEl.classList.remove("is-busy");
        if (this.opened && !controller.signal.aborted) this.renderCandidates(this.candidates, false);
      }
    }
  }

  private async disableTracking(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.modalEl.classList.add("is-busy");
    this.renderCandidates(this.candidates, false);
    try {
      await this.service.state.disable(this.item.filePath, this.item.mediaType);
      await this.options.onDisabled();
      this.busy = false;
      this.modalEl.classList.remove("is-busy");
      super.close();
    } finally {
      if (this.busy) {
        this.busy = false;
        this.modalEl.classList.remove("is-busy");
        this.renderCandidates(this.candidates, false);
      }
    }
  }
}

import { Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { ReleaseTrackingService, ReleaseRefreshItemResult, ReleaseRefreshProgress, ReleaseRefreshSummary } from "../data/release-tracking-service";
import type { MediaItem } from "../domain/media-types";
import { isReleaseTrackingEnabled, isReleaseTrackingMedia } from "../domain/release-tracking-enrollment";
import type { ReleaseTrackingSnapshot, ReleaseTrackingStatus } from "../domain/release-tracking";
import { releaseTrackingText } from "../features/release-tracking/text";
import { MEDIA_UI_LABELS } from "./ui-helpers";

export interface ReleaseTrackingDashboardActions {
  refreshAll(onProgress: (progress: ReleaseRefreshProgress) => void): Promise<ReleaseRefreshSummary>;
  refreshItem(item: MediaItem): Promise<ReleaseRefreshItemResult>;
  reviewItem(item: MediaItem, onResolved: (result: ReleaseRefreshItemResult) => void): void;
  openMedia(path: string): Promise<void> | void;
  onChanged(): void;
}

interface DashboardEntry {
  item: MediaItem;
  snapshot: ReleaseTrackingSnapshot;
  result?: ReleaseRefreshItemResult;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(name: string, className = ""): HTMLElement {
  const node = el("span", className);
  setIcon(node, name);
  return node;
}

function needsAttention(status: ReleaseTrackingStatus): boolean {
  return status === "ambiguous" || status === "unmatched" || status === "provider_error" || status === "source_regressed";
}

function canChooseSource(status: ReleaseTrackingStatus): boolean {
  return status === "ambiguous" || status === "unmatched";
}

function readingProgress(item: MediaItem): string {
  const value = String(item.progress ?? "").trim();
  if (!value) return "—";
  return item.mediaType === "manga" ? `Ch.${value}` : `Vol.${value}`;
}

function releaseValue(item: MediaItem, value: string): string {
  if (!value) return "—";
  return item.mediaType === "manga" ? `Ch.${value}` : `Vol.${value}`;
}

function providerLabel(provider: string): string {
  return provider === "mangadex"
    ? releaseTrackingText("provider.mangadex")
    : provider === "ndl-jpro"
      ? releaseTrackingText("provider.ndl")
      : "—";
}

function statusText(status: ReleaseTrackingStatus, result?: ReleaseRefreshItemResult): string {
  if (result?.kind === "updated") return releaseTrackingText("dashboard.status.updated");
  if (result?.kind === "unchanged") return releaseTrackingText("dashboard.status.unchanged");
  if (result?.kind === "initialized") return releaseTrackingText("dashboard.status.initialized");
  if (status === "verified") return releaseTrackingText("dashboard.status.verified");
  if (status === "ambiguous") return releaseTrackingText("status.ambiguous");
  if (status === "unmatched") return releaseTrackingText("status.unmatched");
  if (status === "provider_error") return releaseTrackingText("status.provider_error");
  if (status === "source_regressed") return releaseTrackingText("status.source_regressed");
  return releaseTrackingText("status.unconfigured");
}

function cover(item: MediaItem): HTMLElement {
  const frame = el("div", "al-release-dashboard-cover");
  const source = item.coverSources?.src || item.cover;
  if (!source) {
    frame.appendChild(icon("book-open"));
    return frame;
  }
  const image = el("img");
  image.src = source;
  image.alt = item.title;
  image.loading = "lazy";
  image.decoding = "async";
  if (item.coverSources?.srcset) image.srcset = item.coverSources.srcset;
  image.addEventListener("error", () => {
    image.remove();
    frame.appendChild(icon("book-open"));
  }, { once: true });
  frame.appendChild(image);
  return frame;
}

export class ReleaseTrackingDashboardModal extends Modal {
  private readonly items: MediaItem[];
  private readonly results = new Map<string, ReleaseRefreshItemResult>();
  private readonly refreshing = new Set<string>();
  private progress: ReleaseRefreshProgress | null = null;
  private allBusy = false;
  private failure = "";

  constructor(
    app: App,
    private readonly service: ReleaseTrackingService,
    items: readonly MediaItem[],
    private readonly actions: ReleaseTrackingDashboardActions,
  ) {
    super(app);
    this.items = items.filter(isReleaseTrackingMedia);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-release-dashboard-modal");
    this.render();
  }

  close(): void {
    if (this.allBusy || this.refreshing.size > 0) return;
    super.close();
  }

  private entry(item: MediaItem): DashboardEntry {
    return {
      item,
      snapshot: this.service.state.read(item.filePath, item.mediaType),
      result: this.results.get(item.filePath),
    };
  }

  private isTracked(item: MediaItem, snapshot = this.service.state.read(item.filePath, item.mediaType)): boolean {
    return isReleaseTrackingEnabled(item, snapshot, this.service.state.hasExplicitStatus(item.filePath));
  }

  private render(): void {
    const entries = this.items.map((item) => this.entry(item));
    const tracked = entries.filter((entry) => this.isTracked(entry.item, entry.snapshot));
    const excluded = entries.filter((entry) => !tracked.includes(entry));
    const attention = tracked.filter((entry) => needsAttention(entry.result?.status ?? entry.snapshot.status));
    const normal = tracked.filter((entry) => !attention.includes(entry));
    const verified = tracked.filter((entry) => (entry.result?.status ?? entry.snapshot.status) === "verified").length;
    const updated = [...this.results.values()].filter((result) => result.kind === "updated").length;

    this.modalEl.classList.toggle("is-busy", this.allBusy || this.refreshing.size > 0);
    this.contentEl.replaceChildren();

    const header = el("header", "al-release-dashboard-header");
    const mark = icon("refresh-cw", "al-release-dashboard-mark");
    const copy = el("div", "al-release-dashboard-heading");
    copy.append(
      el("h2", "", releaseTrackingText("dashboard.title")),
      el("p", "", releaseTrackingText("dashboard.description")),
    );
    const refreshAll = el("button", "mod-cta al-release-dashboard-refresh-all");
    refreshAll.type = "button";
    refreshAll.disabled = this.allBusy || this.refreshing.size > 0 || tracked.length === 0;
    refreshAll.append(icon("refresh-cw"), el("span", "", releaseTrackingText("dashboard.refreshAll")));
    refreshAll.addEventListener("click", () => { void this.refreshEverything(); });
    header.append(mark, copy, refreshAll);
    this.contentEl.appendChild(header);

    const overview = el("div", "al-release-dashboard-overview");
    overview.append(
      this.metric("library", String(tracked.length), releaseTrackingText("dashboard.metricTracked")),
      this.metric("shield-check", String(verified), releaseTrackingText("dashboard.metricVerified")),
      this.metric("arrow-up", String(updated), releaseTrackingText("dashboard.metricUpdated"), updated > 0 ? "is-positive" : ""),
      this.metric("triangle-alert", String(attention.length), releaseTrackingText("dashboard.metricAttention"), attention.length > 0 ? "is-attention" : ""),
    );
    this.contentEl.appendChild(overview);

    if (this.allBusy) this.contentEl.appendChild(this.overallProgress());
    if (this.failure) {
      const failure = el("div", "al-release-dashboard-failure");
      failure.append(icon("triangle-alert"), el("span", "", this.failure));
      this.contentEl.appendChild(failure);
    }

    const body = el("div", "al-release-dashboard-content");
    if (normal.length) body.appendChild(this.section(releaseTrackingText("dashboard.trackedHeading"), normal, "tracked"));
    if (attention.length) body.appendChild(this.section(releaseTrackingText("dashboard.attentionHeading"), attention, "attention"));
    if (excluded.length) body.appendChild(this.section(releaseTrackingText("dashboard.excludedHeading"), excluded, "excluded"));
    if (!entries.length) body.appendChild(el("div", "al-release-dashboard-empty", releaseTrackingText("dashboard.empty")));
    this.contentEl.appendChild(body);

    const footer = el("footer", "al-release-dashboard-footer");
    const note = el("div", "al-release-dashboard-note");
    note.append(icon("shield-check"), el("span", "", releaseTrackingText("modal.note")));
    const close = el("button", "al-secondary-button", releaseTrackingText("modal.close"));
    close.type = "button";
    close.disabled = this.allBusy || this.refreshing.size > 0;
    close.addEventListener("click", () => this.close());
    footer.append(note, close);
    this.contentEl.appendChild(footer);
  }

  private trackedCount(): number {
    return this.items.filter((item) => this.isTracked(item)).length;
  }

  private metric(iconName: string, value: string, label: string, state = ""): HTMLElement {
    const metric = el("div", `al-release-dashboard-metric${state ? ` ${state}` : ""}`);
    metric.append(icon(iconName), el("strong", "", value), el("span", "", label));
    return metric;
  }

  private overallProgress(): HTMLElement {
    const progress = this.progress;
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? this.trackedCount();
    const box = el("div", "al-release-dashboard-progress");
    const header = el("div", "al-release-dashboard-progress-head");
    const current = progress?.item.title || releaseTrackingText("modal.runningPreparing");
    header.append(
      el("span", "al-release-dashboard-progress-current", current),
      el("strong", "al-release-dashboard-progress-count", releaseTrackingText("modal.runningProgress", { completed, total })),
    );
    const track = el("div", "al-release-dashboard-progress-track");
    const fill = el("div", "al-release-dashboard-progress-fill");
    fill.style.width = total > 0 ? `${Math.min(100, Math.max(0, completed / total * 100))}%` : "0%";
    track.appendChild(fill);
    box.append(header, track);
    return box;
  }

  private updateOverallProgress(): void {
    const progress = this.progress;
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? this.trackedCount();
    const current = progress?.item.title || releaseTrackingText("modal.runningPreparing");
    const currentNode = this.contentEl.querySelector<HTMLElement>(".al-release-dashboard-progress-current");
    const countNode = this.contentEl.querySelector<HTMLElement>(".al-release-dashboard-progress-count");
    const fill = this.contentEl.querySelector<HTMLElement>(".al-release-dashboard-progress-fill");
    if (currentNode) currentNode.textContent = current;
    if (countNode) countNode.textContent = releaseTrackingText("modal.runningProgress", { completed, total });
    if (fill) fill.style.width = total > 0 ? `${Math.min(100, Math.max(0, completed / total * 100))}%` : "0%";
  }

  private section(title: string, entries: DashboardEntry[], kind: "tracked" | "attention" | "excluded"): HTMLElement {
    const section = el("section", `al-release-dashboard-section is-${kind}`);
    const head = el("div", "al-release-dashboard-section-head");
    head.append(
      icon(kind === "attention" ? "triangle-alert" : kind === "excluded" ? "list-plus" : "list"),
      el("h3", "", title),
      el("span", "", String(entries.length)),
    );
    const list = el("div", "al-release-dashboard-list");
    for (const entry of entries) list.appendChild(this.row(entry, kind !== "excluded"));
    section.append(head, list);
    return section;
  }

  private row(entry: DashboardEntry, tracked = true): HTMLElement {
    const { item, snapshot, result } = entry;
    const status = result?.status ?? snapshot.status;
    const latest = result?.status === "verified" ? result.after : snapshot.latest;
    const provider = result?.provider || snapshot.binding?.provider || "";
    const busy = this.refreshing.has(item.filePath);
    const row = el("div", `al-release-dashboard-row${busy ? " is-busy" : ""}${needsAttention(status) ? " is-attention" : ""}`);

    const identity = el("div", "al-release-dashboard-identity");
    const title = el("button", "al-release-dashboard-title", item.title);
    title.type = "button";
    title.addEventListener("click", () => { void this.actions.openMedia(item.filePath); });
    identity.append(title, el("span", "al-release-media-chip", MEDIA_UI_LABELS.type[item.mediaType]));

    const progress = this.cell(releaseTrackingText("modal.columnProgress"), readingProgress(item), "al-release-dashboard-reading");
    const latestCell = this.cell(releaseTrackingText("dashboard.latest"), releaseValue(item, latest), "al-release-dashboard-latest");
    const source = this.cell(
      releaseTrackingText("modal.columnSource"),
      result?.sourceLabel || snapshot.sourceLabel || providerLabel(provider),
      "",
    );

    const state = el("div", "al-release-dashboard-state");
    if (tracked) {
      state.append(el("span", `al-release-dashboard-status is-${status}${result ? ` is-${result.kind}` : ""}`, statusText(status, result)));
      if (result?.message) state.appendChild(el("small", "", result.message));
      else if (snapshot.error && needsAttention(status)) state.appendChild(el("small", "", snapshot.error));
    } else {
      state.append(el("span", "al-release-dashboard-status is-disabled", releaseTrackingText("dashboard.notTracked")));
      if (item.status === "completed" && !this.service.state.hasExplicitStatus(item.filePath) && snapshot.status !== "disabled") {
        state.appendChild(el("small", "", releaseTrackingText("dashboard.completedDefaultOff")));
      }
    }
    if (snapshot.checkedAt) {
      const date = new Date(snapshot.checkedAt);
      state.appendChild(el("small", "al-release-dashboard-checked", releaseTrackingText("dashboard.checked", {
        time: Number.isFinite(date.getTime()) ? date.toLocaleString() : snapshot.checkedAt,
      })));
    }

    const actions = el("div", "al-release-dashboard-row-actions");
    if (!tracked) {
      const add = el("button", "al-secondary-button al-release-dashboard-enable", releaseTrackingText("dashboard.addTracking"));
      add.type = "button";
      add.disabled = busy || this.allBusy;
      add.addEventListener("click", () => { void this.enableTracking(item); });
      actions.appendChild(add);
    } else if (canChooseSource(status)) {
      const choose = el("button", "al-secondary-button al-release-dashboard-choose", releaseTrackingText("modal.review"));
      choose.type = "button";
      choose.disabled = busy || this.allBusy;
      choose.addEventListener("click", () => {
        this.actions.reviewItem(item, (resolved) => {
          this.results.set(item.filePath, resolved);
          this.actions.onChanged();
          this.render();
        });
      });
      actions.appendChild(choose);
    }
    if (tracked) {
      const refresh = el("button", "clickable-icon al-release-dashboard-refresh-one");
      refresh.type = "button";
      refresh.setAttribute("aria-label", releaseTrackingText("dashboard.refreshOne", { title: item.title }));
      refresh.title = releaseTrackingText("dashboard.refreshOne", { title: item.title });
      refresh.disabled = busy || this.allBusy;
      refresh.appendChild(icon("refresh-cw"));
      refresh.addEventListener("click", () => { void this.refreshOne(item); });
      actions.appendChild(refresh);
    }

    row.append(cover(item), identity, progress, latestCell, source, state, actions);
    if (busy) {
      const activity = el("div", "al-release-dashboard-row-progress");
      activity.appendChild(el("div", "al-release-dashboard-row-progress-fill"));
      row.appendChild(activity);
    }
    return row;
  }

  private cell(label: string, value: string, valueClass: string): HTMLElement {
    const cell = el("div", "al-release-dashboard-cell");
    cell.append(el("span", "", label), el("strong", valueClass, value));
    return cell;
  }

  private async enableTracking(item: MediaItem): Promise<void> {
    if (this.allBusy || this.refreshing.has(item.filePath)) return;
    this.failure = "";
    this.refreshing.add(item.filePath);
    this.render();
    try {
      await this.service.state.enable(item.filePath, item.mediaType);
      this.results.delete(item.filePath);
      this.actions.onChanged();
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
    } finally {
      this.refreshing.delete(item.filePath);
      this.render();
    }
  }

  private async refreshOne(item: MediaItem): Promise<void> {
    if (this.allBusy || this.refreshing.has(item.filePath)) return;
    this.failure = "";
    this.refreshing.add(item.filePath);
    this.render();
    try {
      const result = await this.actions.refreshItem(item);
      this.results.set(item.filePath, result);
      this.actions.onChanged();
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
    } finally {
      this.refreshing.delete(item.filePath);
      this.render();
    }
  }

  private async refreshEverything(): Promise<void> {
    if (this.allBusy || this.refreshing.size > 0) return;
    this.failure = "";
    this.allBusy = true;
    this.progress = null;
    this.render();
    try {
      const summary = await this.actions.refreshAll((progress) => {
        this.progress = progress;
        this.updateOverallProgress();
      });
      for (const result of summary.results) this.results.set(result.item.filePath, result);
      this.actions.onChanged();
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
    } finally {
      this.allBusy = false;
      this.progress = null;
      this.render();
    }
  }
}

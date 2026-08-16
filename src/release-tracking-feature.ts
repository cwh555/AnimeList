import { Notice, type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "./app/feature-types";
import {
  ReleaseTrackingService,
  type ReleaseRefreshProgress,
  type ReleaseRefreshSummary,
} from "./data/release-tracking-service";
import {
  releaseTrackingSnapshotFromFrontmatter,
  type ReleaseTrackingSnapshot,
} from "./domain/release-tracking";
import type { MediaItem, MediaType } from "./domain/media-types";
import { releaseTrackingItemsForRefresh } from "./domain/release-tracking-enrollment";
import { releaseTrackingText } from "./release-tracking-text";
import { ReleaseTrackingMatchModal } from "./ui/release-tracking-modal";
import { ReleaseTrackingDashboardModal } from "./ui/release-tracking-dashboard-modal";
import { ReleaseTrackingManagerModal } from "./ui/release-tracking-manager-modal";
import { makeEl, setAnimeListIcon } from "./ui/ui-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_POLL_MS = 60 * 60 * 1000;
const INITIAL_AUTO_DELAY_MS = 10_000;

const services = new WeakMap<AnimeListFeatureHost, ReleaseTrackingService>();
type ReleaseProgressListener = (progress: ReleaseRefreshProgress) => void;

interface ActiveReleaseCheck {
  promise: Promise<ReleaseRefreshSummary>;
  listeners: Set<ReleaseProgressListener>;
  latest?: ReleaseRefreshProgress;
}

const activeChecks = new WeakMap<AnimeListFeatureHost, ActiveReleaseCheck>();

function serviceFor(host: AnimeListFeatureHost): ReleaseTrackingService {
  let service = services.get(host);
  if (!service) {
    service = new ReleaseTrackingService(host.app);
    services.set(host, service);
  }
  return service;
}

function providerLabel(snapshot: ReleaseTrackingSnapshot): string {
  if (snapshot.sourceLabel) return snapshot.sourceLabel;
  return snapshot.binding?.provider === "mangadex"
    ? releaseTrackingText("provider.mangadex")
    : snapshot.binding?.provider === "ndl-jpro"
      ? releaseTrackingText("provider.ndl")
      : "";
}

function attentionLabel(status: ReleaseTrackingSnapshot["status"]): string {
  if (status === "ambiguous") return releaseTrackingText("status.ambiguous");
  if (status === "unmatched") return releaseTrackingText("status.unmatched");
  if (status === "provider_error") return releaseTrackingText("status.provider_error");
  if (status === "source_regressed") return releaseTrackingText("status.source_regressed");
  return releaseTrackingText("status.unconfigured");
}

function latestLabel(mediaType: MediaType, latest: string): string {
  return releaseTrackingText(
    mediaType === "manga" ? "library.latestChapter" : "library.latestVolume",
    { latest },
  );
}

function snapshotForItem(service: ReleaseTrackingService, item: MediaItem): ReleaseTrackingSnapshot | null {
  if (item.mediaType === "anime") return null;
  try {
    return service.state.read(item.filePath, item.mediaType);
  } catch {
    return null;
  }
}

function openMatchModal(
  host: AnimeListFeatureHost,
  item: MediaItem,
  onResolved?: (result: Awaited<ReturnType<ReleaseTrackingService["refreshItem"]>>) => void,
): void {
  const service = serviceFor(host);
  new ReleaseTrackingMatchModal(host.app, service, item, {
    async onResolved(result) {
      host.refreshViews();
      onResolved?.(result);
      if (result.kind === "updated") {
        new Notice(releaseTrackingText("notice.updated", { count: 1 }));
      } else if (result.kind === "attention") {
        new Notice(releaseTrackingText("notice.attention", { count: 1 }));
      }
    },
    async onDisabled() {
      host.refreshViews();
    },
  }).open();
}

async function performReleaseCheck(
  host: AnimeListFeatureHost,
  onProgress?: ReleaseProgressListener,
): Promise<ReleaseRefreshSummary> {
  const existing = activeChecks.get(host);
  if (existing) {
    if (onProgress) {
      existing.listeners.add(onProgress);
      if (existing.latest) onProgress(existing.latest);
    }
    return existing.promise;
  }

  const listeners = new Set<ReleaseProgressListener>();
  if (onProgress) listeners.add(onProgress);
  const active = {} as ActiveReleaseCheck;
  active.listeners = listeners;
  const service = serviceFor(host);
  const trackedItems = releaseTrackingItemsForRefresh(
    host.collectMediaItems(),
    (item) => service.state.read(item.filePath, item.mediaType),
    (item) => service.state.hasExplicitStatus(item.filePath),
  );
  active.promise = Promise.resolve()
    .then(() => service.refreshAll(trackedItems, (progress) => {
      active.latest = progress;
      active.listeners.forEach((listener) => listener(progress));
    }))
    .finally(() => activeChecks.delete(host));
  activeChecks.set(host, active);
  return active.promise;
}

async function performReleaseItemCheck(host: AnimeListFeatureHost, item: MediaItem) {
  const existing = activeChecks.get(host);
  if (existing) {
    const summary = await existing.promise;
    const result = summary.results.find((entry) => entry.item.filePath === item.filePath);
    if (result) return result;
  }
  return serviceFor(host).refreshItem(item);
}

function openReleaseDashboard(host: AnimeListFeatureHost): void {
  if (!host.settings.releaseTracking.enabled) {
    new Notice(releaseTrackingText("notice.disabled"));
    return;
  }

  const service = serviceFor(host);
  new ReleaseTrackingDashboardModal(host.app, service, host.collectMediaItems(), {
    refreshAll: (onProgress) => performReleaseCheck(host, onProgress),
    refreshItem: (item) => performReleaseItemCheck(host, item),
    reviewItem: (item, onResolved) => openMatchModal(host, item, onResolved),
    openMedia: (path) => host.openMediaFile(path),
    onChanged: () => host.refreshViews(),
  }).open();
}

function automaticCheckDue(host: AnimeListFeatureHost, now = Date.now()): boolean {
  if (!host.settings.releaseTracking.enabled || !host.settings.releaseTracking.automatic) return false;
  const last = Date.parse(host.settings.releaseTracking.lastAutomaticCheckAt);
  return !Number.isFinite(last) || now - last >= DAY_MS;
}

async function runAutomaticReleaseCheck(host: AnimeListFeatureHost): Promise<void> {
  if (!automaticCheckDue(host)) return;
  try {
    const summary = await performReleaseCheck(host);
    host.settings.releaseTracking.lastAutomaticCheckAt = new Date().toISOString();
    await host.saveSettings();
    if (summary.updated > 0) {
      new Notice(releaseTrackingText("notice.updated", { count: summary.updated }));
    }
    if (summary.attention > 0) {
      new Notice(releaseTrackingText("notice.attention", { count: summary.attention }));
    }
    if (summary.updated > 0 || summary.initialized > 0 || summary.attention > 0) host.refreshViews();
  } catch (error) {
    console.error("AnimeList automatic release check failed", error);
  }
}

function installAutomaticChecks(host: AnimeListFeatureHost): void {
  const first = window.setTimeout(() => { void runAutomaticReleaseCheck(host); }, INITIAL_AUTO_DELAY_MS);
  const timer = window.setInterval(() => { void runAutomaticReleaseCheck(host); }, AUTO_POLL_MS);
  host.register(() => {
    window.clearTimeout(first);
    window.clearInterval(timer);
  });
}

function decorateReleaseCards(
  host: AnimeListFeatureHost,
  container: HTMLElement,
  items: readonly MediaItem[],
): void {
  const service = serviceFor(host);
  for (const item of items) {
    const snapshot = snapshotForItem(service, item);
    if (!snapshot || (!snapshot.latest && snapshot.status === "unconfigured")) continue;
    const card = Array.from(container.querySelectorAll<HTMLElement>(".al-card"))
      .find((candidate) => candidate.dataset.path === item.filePath);
    const progress = card?.querySelector<HTMLElement>(".al-progress");
    if (!card || !progress || progress.querySelector(":scope > .al-release-tracking-card")) continue;

    const row = makeEl("div", "al-card-footer al-release-tracking-card");
    if (snapshot.latest) {
      const latest = makeEl("span", "al-score", latestLabel(item.mediaType, snapshot.latest));
      row.appendChild(latest);
      const source = providerLabel(snapshot);
      if (source) {
        const provider = makeEl("span", "al-result-meta", source);
        row.appendChild(provider);
      }
    }
    if (snapshot.status !== "verified" && snapshot.status !== "disabled") {
      const canReview = snapshot.status === "ambiguous" || snapshot.status === "unmatched";
      const warning = makeEl(canReview ? "button" : "span", "al-status-chip is-active", releaseTrackingText("library.needsAttention"));
      warning.title = snapshot.error || attentionLabel(snapshot.status);
      if (warning instanceof HTMLButtonElement) {
        warning.type = "button";
        warning.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMatchModal(host, item);
        });
      }
      row.appendChild(warning);
    }
    progress.appendChild(row);
  }
}

function installLibraryRefreshButton(
  host: AnimeListFeatureHost,
  container: HTMLElement,
): void {
  if (!host.settings.releaseTracking.enabled) return;
  const actions = container.querySelector<HTMLElement>(".al-hero-actions");
  if (!actions || actions.querySelector(":scope > .al-release-refresh-button")) return;
  const button = makeEl("button", "al-secondary-button al-release-refresh-button");
  button.type = "button";
  const render = (label: string): void => {
    button.replaceChildren();
    const icon = makeEl("span", "al-icon");
    setAnimeListIcon(icon, "refresh-cw");
    button.append(icon, makeEl("span", "", label));
  };
  render(releaseTrackingText("library.check"));
  button.addEventListener("click", () => {
    openReleaseDashboard(host);
  });
  const add = actions.querySelector<HTMLElement>(".al-add-button");
  actions.insertBefore(button, add ?? null);
}

function appendDetailRow(parent: HTMLElement, label: string, value: string, className = ""): void {
  const row = makeEl("span", `al-detail-summary${className ? ` ${className}` : ""}`);
  row.append(makeEl("strong", "", label), makeEl("span", "", value));
  parent.appendChild(row);
}

function decorateDetail(container: HTMLElement, frontmatter: Record<string, unknown>): void {
  const mediaType: MediaType = frontmatter.media_type === "manga" || frontmatter.media_type === "novel"
    ? frontmatter.media_type
    : "anime";
  if (mediaType === "anime") return;
  const snapshot = releaseTrackingSnapshotFromFrontmatter(frontmatter, mediaType);
  if (!snapshot.latest && snapshot.status === "unconfigured") return;

  const panel = makeEl("section", "al-detail-actions al-release-tracking-detail");
  if (snapshot.latest) {
    appendDetailRow(
      panel,
      releaseTrackingText(mediaType === "manga" ? "detail.latestChapter" : "detail.latestVolume"),
      mediaType === "manga" ? `Ch.${snapshot.latest}` : `Vol.${snapshot.latest}`,
      "is-latest",
    );
  }
  const source = providerLabel(snapshot);
  if (source) appendDetailRow(panel, releaseTrackingText("detail.source"), source);
  if (snapshot.checkedAt) {
    const date = new Date(snapshot.checkedAt);
    appendDetailRow(
      panel,
      releaseTrackingText("detail.lastVerified"),
      Number.isFinite(date.getTime()) ? date.toLocaleString() : snapshot.checkedAt,
    );
  }
  if (snapshot.status !== "verified" && snapshot.status !== "disabled") {
    appendDetailRow(
      panel,
      releaseTrackingText("detail.statusAttention"),
      snapshot.error || attentionLabel(snapshot.status),
      "is-attention",
    );
  }
  container.appendChild(panel);
}

export function createReleaseTrackingSettingsSection(host: AnimeListFeatureHost): FeatureSettingsSection {
  return {
    heading: releaseTrackingText("settings.heading"),
    definitions: [{
      name: releaseTrackingText("settings.enabled.name"),
      desc: releaseTrackingText("settings.enabled.desc"),
      render: (setting: Setting) => {
        setting.addToggle((toggle) => {
          toggle.setValue(host.settings.releaseTracking.enabled);
          toggle.onChange(async (enabled) => {
            host.settings.releaseTracking.enabled = enabled;
            if (!enabled) host.settings.releaseTracking.automatic = false;
            await host.saveSettings();
            host.refreshViews();
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.automatic.name"),
      desc: releaseTrackingText("settings.automatic.desc"),
      render: (setting: Setting) => {
        setting.addToggle((toggle) => {
          toggle.setValue(host.settings.releaseTracking.automatic);
          toggle.onChange(async (automatic) => {
            host.settings.releaseTracking.automatic = automatic;
            if (automatic) host.settings.releaseTracking.lastAutomaticCheckAt = "";
            await host.saveSettings();
            if (automatic) void runAutomaticReleaseCheck(host);
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.manage.name"),
      desc: releaseTrackingText("settings.manage.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(releaseTrackingText("settings.manage.button"));
          button.onClick(() => {
            new ReleaseTrackingManagerModal(host.app, serviceFor(host), host.collectMediaItems(), {
              onApplied() { host.refreshViews(); },
            }).open();
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.checkNow.name"),
      desc: releaseTrackingText("settings.checkNow.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(releaseTrackingText("settings.checkNow.button"));
          button.onClick(() => { openReleaseDashboard(host); });
        });
      },
    }],
  };
}

export const releaseTrackingFeature = defineFeature<AnimeListFeatureHost>({
  id: "release-tracking",
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      serviceFor(host);
      installAutomaticChecks(host);
    },
  }, {
    kind: "settings",
    sections(host) {
      return createReleaseTrackingSettingsSection(host);
    },
  }, {
    kind: "library",
    afterRender({ host, container, items }) {
      installLibraryRefreshButton(host, container);
      decorateReleaseCards(host, container, items);
    },
  }, {
    kind: "detail",
    afterRender({ container, frontmatter }) {
      decorateDetail(container, frontmatter);
    },
  }],
});

import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import {
  ReleaseTrackingService,
  type ReleaseRefreshProgress,
  type ReleaseRefreshSummary,
} from "../../data/release-tracking-service";
import { releaseTrackingItemsForRefresh } from "../../domain/release-tracking-enrollment";
import type { MediaItem } from "../../domain/media-types";
import { ReleaseTrackingDashboardModal } from "../../ui/release-tracking-dashboard-modal";
import { ReleaseTrackingMatchModal } from "../../ui/release-tracking-modal";
import { releaseTrackingText } from "./text";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_POLL_MS = 60 * 60 * 1000;
const INITIAL_AUTO_DELAY_MS = 10_000;

const services = new WeakMap<AnimeListFeatureHost, ReleaseTrackingService>();
type ReleaseProgressListener = (progress: ReleaseRefreshProgress) => void;

interface ActiveReleaseCheck {
  promise: Promise<ReleaseRefreshSummary>;
  listeners: Set<ReleaseProgressListener>;
  controller: AbortController;
  latest?: ReleaseRefreshProgress;
}

const activeChecks = new WeakMap<AnimeListFeatureHost, ActiveReleaseCheck>();

export function serviceFor(host: AnimeListFeatureHost): ReleaseTrackingService {
  let service = services.get(host);
  if (!service) {
    service = new ReleaseTrackingService(host.app);
    services.set(host, service);
  }
  return service;
}

export function openMatchModal(
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
  active.controller = new AbortController();
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
    }, active.controller.signal))
    .finally(() => activeChecks.delete(host));
  activeChecks.set(host, active);
  return active.promise;
}

export function cancelReleaseCheck(host: AnimeListFeatureHost): void {
  activeChecks.get(host)?.controller.abort();
}

async function performReleaseItemCheck(host: AnimeListFeatureHost, item: MediaItem, signal?: AbortSignal) {
  const existing = activeChecks.get(host);
  if (existing) {
    const summary = await existing.promise;
    const result = summary.results.find((entry) => entry.item.filePath === item.filePath);
    if (result) return result;
  }
  return serviceFor(host).refreshItem(item, undefined, signal);
}

export function openReleaseDashboard(host: AnimeListFeatureHost): void {
  if (!host.settings.releaseTracking.enabled) {
    new Notice(releaseTrackingText("notice.disabled"));
    return;
  }

  const service = serviceFor(host);
  new ReleaseTrackingDashboardModal(host.app, service, host.collectMediaItems(), {
    refreshAll: (onProgress) => performReleaseCheck(host, onProgress),
    cancelRefreshAll: () => cancelReleaseCheck(host),
    refreshItem: (item, signal) => performReleaseItemCheck(host, item, signal),
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

export async function runAutomaticReleaseCheck(host: AnimeListFeatureHost): Promise<void> {
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

export function installAutomaticChecks(host: AnimeListFeatureHost): void {
  const first = window.setTimeout(() => { void runAutomaticReleaseCheck(host); }, INITIAL_AUTO_DELAY_MS);
  const timer = window.setInterval(() => { void runAutomaticReleaseCheck(host); }, AUTO_POLL_MS);
  host.register(() => {
    window.clearTimeout(first);
    window.clearInterval(timer);
  });
}

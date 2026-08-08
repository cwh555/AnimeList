import { TFile, type App } from "obsidian";
import type { MediaType } from "../domain/media-types";
import {
  releaseTrackingSnapshotFromFrontmatter,
  type ReleaseTrackingBinding,
  type ReleaseTrackingSnapshot,
  type ReleaseTrackingStatus,
} from "../domain/release-tracking";

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function sameBinding(left: ReleaseTrackingBinding | null, right: ReleaseTrackingBinding): boolean {
  return left?.provider === right.provider
    && (left.sourceId ?? "") === (right.sourceId ?? "")
    && (left.title ?? "") === (right.title ?? "")
    && (left.creator ?? "") === (right.creator ?? "")
    && (left.publisher ?? "") === (right.publisher ?? "");
}

export class ReleaseTrackingStateService {
  constructor(private readonly app: App) {}

  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Media note not found: ${path}`);
    return file;
  }

  read(path: string, mediaType: MediaType): ReleaseTrackingSnapshot {
    const file = this.file(path);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    return releaseTrackingSnapshotFromFrontmatter(frontmatter, mediaType);
  }

  private async update(path: string, apply: (frontmatter: Record<string, unknown>) => void): Promise<void> {
    const file = this.file(path);
    await this.app.fileManager.processFrontMatter(file, apply);
  }

  async writeBinding(path: string, mediaType: MediaType, binding: ReleaseTrackingBinding): Promise<boolean> {
    const current = this.read(path, mediaType);
    if (sameBinding(current.binding, binding) && current.status !== "disabled") return false;
    await this.update(path, (frontmatter) => {
      frontmatter.release_tracking_provider = binding.provider;
      if (binding.sourceId) frontmatter.release_tracking_ref = binding.sourceId;
      else delete frontmatter.release_tracking_ref;
      if (binding.title) frontmatter.release_tracking_title = binding.title;
      else delete frontmatter.release_tracking_title;
      if (binding.creator) frontmatter.release_tracking_creator = binding.creator;
      else delete frontmatter.release_tracking_creator;
      if (binding.publisher) frontmatter.release_tracking_publisher = binding.publisher;
      else delete frontmatter.release_tracking_publisher;
      frontmatter.release_tracking_status = "unconfigured";
      delete frontmatter.release_tracking_error;
    });
    return true;
  }

  async writeVerified(
    path: string,
    mediaType: MediaType,
    binding: ReleaseTrackingBinding,
    latest: string,
    latestReleaseDate = "",
    sourceUrl = "",
  ): Promise<boolean> {
    const current = this.read(path, mediaType);
    if (
      current.status === "verified"
      && sameBinding(current.binding, binding)
      && current.latest === latest
      && current.latestReleaseDate === latestReleaseDate
      && !current.error
    ) return false;
    const verifiedAt = new Date().toISOString();
    await this.update(path, (frontmatter) => {
      frontmatter.release_tracking_provider = binding.provider;
      if (binding.sourceId) frontmatter.release_tracking_ref = binding.sourceId;
      else delete frontmatter.release_tracking_ref;
      if (binding.title) frontmatter.release_tracking_title = binding.title;
      else delete frontmatter.release_tracking_title;
      if (binding.creator) frontmatter.release_tracking_creator = binding.creator;
      else delete frontmatter.release_tracking_creator;
      if (binding.publisher) frontmatter.release_tracking_publisher = binding.publisher;
      else delete frontmatter.release_tracking_publisher;
      frontmatter.release_tracking_status = "verified";
      frontmatter.release_tracking_verified_at = verifiedAt;
      if (sourceUrl) frontmatter.release_tracking_source_url = sourceUrl;
      else delete frontmatter.release_tracking_source_url;
      if (mediaType === "manga") {
        frontmatter.latest_chapter = latest;
      } else if (mediaType === "novel") {
        frontmatter.latest_volume = latest;
      }
      if (latestReleaseDate) frontmatter.latest_release_date = latestReleaseDate;
      else delete frontmatter.latest_release_date;
      delete frontmatter.release_tracking_error;
    });
    return true;
  }

  async writeAttention(
    path: string,
    mediaType: MediaType,
    status: Exclude<ReleaseTrackingStatus, "verified" | "disabled">,
    error: string,
  ): Promise<boolean> {
    const current = this.read(path, mediaType);
    if (current.status === status && current.error === error) return false;
    await this.update(path, (frontmatter) => {
      frontmatter.release_tracking_status = status;
      frontmatter.release_tracking_error = error;
    });
    return true;
  }

  async disable(path: string, mediaType: MediaType): Promise<boolean> {
    const current = this.read(path, mediaType);
    if (current.status === "disabled") return false;
    await this.update(path, (frontmatter) => {
      frontmatter.release_tracking_status = "disabled";
      delete frontmatter.release_tracking_error;
    });
    return true;
  }

  sourceUrl(path: string): string {
    const file = this.file(path);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    return stringValue(frontmatter.release_tracking_source_url);
  }
}

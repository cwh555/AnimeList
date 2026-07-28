import { setIcon } from "obsidian";
import type { MediaItem } from "../types";
import { mediaStatusLabel, uiText } from "../ui-text";

export const MEDIA_UI_LABELS = {
  type: {
    get all(): string { return uiText("media.type.all"); },
    get anime(): string { return uiText("media.type.anime"); },
    get manga(): string { return uiText("media.type.manga"); },
    get novel(): string { return uiText("media.type.novel"); },
  },
  unit: {
    get episode(): string { return uiText("media.unit.episode"); },
    get chapter(): string { return uiText("media.unit.chapter"); },
    get volume(): string { return uiText("media.unit.volume"); },
    get page(): string { return uiText("media.unit.page"); },
    get percent(): string { return uiText("media.unit.percent"); },
  },
  releaseStatus: {
    get releasing(): string { return uiText("media.release.releasing"); },
    get finished(): string { return uiText("media.release.finished"); },
    get hiatus(): string { return uiText("media.release.hiatus"); },
    get cancelled(): string { return uiText("media.release.cancelled"); },
    get unknown(): string { return uiText("media.release.unknown"); },
  },
};

export function mediaUnitLabel(unit: string): string {
  switch (unit) {
    case "episode": return MEDIA_UI_LABELS.unit.episode;
    case "chapter": return MEDIA_UI_LABELS.unit.chapter;
    case "volume": return MEDIA_UI_LABELS.unit.volume;
    case "page": return MEDIA_UI_LABELS.unit.page;
    case "percent": return MEDIA_UI_LABELS.unit.percent;
    default: return unit;
  }
}

export function mediaReleaseStatusLabel(status: MediaItem["releaseStatus"]): string {
  return MEDIA_UI_LABELS.releaseStatus[status];
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function numeric(value: unknown): number;
export function numeric(value: unknown, fallback: number): number;
export function numeric(value: unknown, fallback: null): number | null;
export function numeric(value: unknown, fallback: number | null = 0): number | null {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formValue(value: unknown, fallback: string | number = ""): string | number {
  return typeof value === "string" || typeof value === "number" ? value : fallback;
}

export function parseDateValue(value: unknown): number {
  if (!value) return 0;
  const time = Date.parse(String(formValue(value)));
  return Number.isFinite(time) ? time : 0;
}

export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "Unknown error";
}

export function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function itemStatusLabel(item: Pick<MediaItem, "status" | "mediaType">): string {
  return mediaStatusLabel(item.status, item.mediaType);
}

export function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string | number | null,
): HTMLElementTagNameMap[K] {
  const node = createEl(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function setAnimeListIcon(element: HTMLElement, name: string): HTMLElement {
  const iconIds: Record<string, string> = {
    search: "search", grid: "layout-grid", list: "list", poster: "image",
    sort: "list-filter", book: "book-open", plus: "plus", edit: "pencil",
    timeline: "git-branch", trash: "trash-2", external: "external-link",
    minus: "minus", fit: "maximize-2",
  };
  setIcon(element, iconIds[name] ?? name);
  return element;
}

export function appendIconLabel(element: HTMLElement, icon: string, label: string): HTMLElement {
  setAnimeListIcon(element, icon);
  element.appendChild(makeEl("span", "", label));
  return element;
}

import { normalizePath, type DataAdapter } from "obsidian";
import { normalizeImageSectionPath } from "../domain/image-section";
import { moveAdapterFileToVaultTrash } from "./vault-trash";

export interface ImageSectionOrderJournalSection {
  id: string;
  lineStart?: number;
  expectedPaths: string[];
  paths: string[];
}

export interface ImageSectionOrderJournalRecord {
  version: 1;
  sourcePath: string;
  sections: ImageSectionOrderJournalSection[];
  updatedAt: number;
}

export interface ImageSectionOrderJournalStore {
  loadAll(): Promise<ImageSectionOrderJournalRecord[]>;
  write(record: ImageSectionOrderJournalRecord): Promise<void>;
  remove(sourcePath: string): Promise<void>;
}

const JOURNAL_VERSION = 1 as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function unsignedHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function imageSectionOrderJournalKey(sourcePath: string): string {
  const value = normalizePath(sourcePath).replace(/^\/+/, "");
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
    right ^= right >>> 13;
  }
  return `${unsignedHex(left)}${unsignedHex(right)}`;
}

function normalizePaths(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeImageSectionPath).filter(Boolean);
}

function parseSection(value: unknown): ImageSectionOrderJournalSection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const expectedPaths = normalizePaths(raw.expectedPaths);
  const paths = normalizePaths(raw.paths);
  const lineStart = typeof raw.lineStart === "number" && Number.isFinite(raw.lineStart)
    ? Math.max(0, Math.trunc(raw.lineStart))
    : undefined;
  return { id, lineStart, expectedPaths, paths };
}

export function parseImageSectionOrderJournalRecord(value: unknown): ImageSectionOrderJournalRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== JOURNAL_VERSION || typeof raw.sourcePath !== "string") return null;
  const sourcePath = normalizePath(raw.sourcePath).replace(/^\/+/, "");
  if (!sourcePath || !Array.isArray(raw.sections)) return null;
  const sections = raw.sections.map(parseSection).filter((section): section is ImageSectionOrderJournalSection => Boolean(section));
  if (!sections.length) return null;
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
    ? Math.max(0, Math.trunc(raw.updatedAt))
    : 0;
  return { version: JOURNAL_VERSION, sourcePath, sections, updatedAt };
}

async function ensureDirectory(adapter: DataAdapter, path: string): Promise<void> {
  const clean = normalizePath(path).replace(/^\/+|\/+$/g, "");
  if (!clean) return;
  let current = "";
  for (const part of clean.split("/").filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    if (!await adapter.exists(current)) await adapter.mkdir(current);
  }
}

export class ImageSectionOrderJournal implements ImageSectionOrderJournalStore {
  readonly root: string;

  constructor(
    private readonly adapter: DataAdapter,
    root: string,
  ) {
    this.root = normalizePath(root).replace(/\/+$/g, "");
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.adapter, this.root);
  }

  pathFor(sourcePath: string): string {
    return normalizePath(`${this.root}/${imageSectionOrderJournalKey(sourcePath)}.json`);
  }

  async loadAll(): Promise<ImageSectionOrderJournalRecord[]> {
    await this.initialize();
    const listing = await this.adapter.list(this.root);
    const records: ImageSectionOrderJournalRecord[] = [];
    for (const path of listing.files.filter((entry) => entry.toLocaleLowerCase().endsWith(".json"))) {
      try {
        const raw = decoder.decode(await this.adapter.readBinary(path));
        const record = parseImageSectionOrderJournalRecord(JSON.parse(raw));
        if (record) records.push(record);
      } catch {
        // Ignore malformed sidecars. They are not canonical data and must never block the plugin.
      }
    }
    return records;
  }

  async write(record: ImageSectionOrderJournalRecord): Promise<void> {
    await this.initialize();
    const normalized: ImageSectionOrderJournalRecord = {
      version: JOURNAL_VERSION,
      sourcePath: normalizePath(record.sourcePath).replace(/^\/+/, ""),
      sections: record.sections.map((section) => ({
        id: section.id,
        lineStart: section.lineStart,
        expectedPaths: normalizePaths(section.expectedPaths),
        paths: normalizePaths(section.paths),
      })),
      updatedAt: Math.max(0, Math.trunc(record.updatedAt || Date.now())),
    };
    await this.adapter.writeBinary(this.pathFor(normalized.sourcePath), encoder.encode(`${JSON.stringify(normalized)}\n`).buffer);
  }

  async remove(sourcePath: string): Promise<void> {
    const path = this.pathFor(sourcePath);
    await moveAdapterFileToVaultTrash(this.adapter, path, "image-order");
  }
}

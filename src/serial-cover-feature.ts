import { Modal, Notice, TFile, setIcon } from "obsidian";
import type AnimeListPlugin from "./main";
import { getScopedMarkdownFiles } from "./vault-scope";
import {
  confidentSerialCover,
  selectOriginalTitle,
  serialCoverQuery,
  type RankedSerialCoverCandidate,
} from "./serial-entry-cover";
import { searchSerialCovers } from "./serial-cover-provider";
import { serialCoverText } from "./serial-cover-text";
import type { ExternalMediaResult, MediaType } from "./types";

interface StoredCover { cover: string; provider: string; sourceId: string; manual: boolean; }
interface EditorContext {
  modal: HTMLElement;
  editPath: string | null;
  mediaType: "manga" | "novel";
  originalTitle: string;
  covers: Map<string, StoredCover>;
  attempted: Set<string>;
}
export interface SerialCoverMigrationDetail {
  filePath: string; title: string; label: string;
  status: "loaded" | "not-found" | "failed" | "skipped"; message: string;
}
export interface SerialCoverMigrationSummary {
  scanned: number; loaded: number; notFound: number; failed: number; skipped: number;
  details: SerialCoverMigrationDetail[];
}
export interface SerialCoverMigrationProgress {
  completed: number; total: number; phase: "scanning" | "resolving" | "loading" | "saving"; message: string;
}
type SerialCoverPlugin = AnimeListPlugin & {
  loadMissingSerialCovers?: (
    onProgress?: (progress: SerialCoverMigrationProgress) => void,
    signal?: AbortSignal,
  ) => Promise<SerialCoverMigrationSummary>;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function readCovers(value: unknown): Map<string, StoredCover> {
  const output = new Map<string, StoredCover>();
  for (const raw of list(value)) {
    const entry = record(raw); const label = text(entry?.label ?? entry?.volume).trim(); const cover = text(entry?.cover);
    if (label && cover) output.set(label, {
      cover, provider: text(entry?.cover_provider), sourceId: text(entry?.cover_source_id),
      manual: entry?.cover_manual === true,
    });
  }
  return output;
}
function mergeCovers(frontmatter: Record<string, unknown>, covers: Map<string, StoredCover>): void {
  if (!Array.isArray(frontmatter.volume_log)) return;
  frontmatter.volume_log = frontmatter.volume_log.map((raw) => {
    const entry = record(raw); const cover = entry ? covers.get(text(entry.label ?? entry.volume).trim()) : undefined;
    if (!entry || !cover) return raw;
    return { ...entry, cover: cover.cover, cover_provider: cover.provider || undefined,
      cover_source_id: cover.sourceId || undefined, cover_manual: cover.manual || undefined };
  });
}
function asResult(candidate: RankedSerialCoverCandidate, mediaType: MediaType): ExternalMediaResult {
  return {
    provider: candidate.provider, sourceId: candidate.sourceId, title: candidate.title,
    originalTitle: candidate.title, romajiTitle: "", mediaType,
    format: mediaType === "novel" ? "light_novel" : "manga", total: 0, unit: "volume", year: "",
    genres: [], rawGenres: [], people: [], platforms: [], sourceUrl: candidate.infoUrl,
    coverUrl: candidate.coverUrl, summary: "", externalScore: null, releaseStatus: "unknown",
  };
}
async function loadBest(plugin: AnimeListPlugin, context: EditorContext, label: string) {
  const query = serialCoverQuery(context.originalTitle, label);
  if (!query) return { cover: null as StoredCover | null, candidates: [] as RankedSerialCoverCandidate[] };
  const candidates = await searchSerialCovers(query, context.originalTitle, label);
  const best = confidentSerialCover(candidates);
  if (!best) return { cover: null, candidates };
  const cover = await plugin.downloadCover(asResult(best, context.mediaType));
  return { cover: { cover, provider: best.provider, sourceId: best.sourceId, manual: false }, candidates };
}

class CoverSelector extends Modal {
  private selected: RankedSerialCoverCandidate | null = null;
  constructor(
    private pluginRef: AnimeListPlugin,
    private context: EditorContext,
    private label: string,
    private candidates: RankedSerialCoverCandidate[],
    private applyCover: (cover: StoredCover) => void,
  ) { super(pluginRef.app); }
  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-serial-cover-modal");
    this.titleEl.setText(serialCoverText("selectorTitle", { unit: "entry", label: this.label }));
    const query = serialCoverQuery(this.context.originalTitle, this.label) ?? "";
    const field = this.contentEl.createEl("label", { cls: "al-form-field" });
    field.createEl("span", { cls: "al-form-label", text: serialCoverText("query") });
    const input = field.createEl("input", { type: "text" }); input.value = query; input.readOnly = true;
    const results = this.contentEl.createDiv({ cls: "al-serial-cover-results" });
    const render = (items: RankedSerialCoverCandidate[]): void => {
      results.empty();
      items.forEach((candidate) => {
        const button = results.createEl("button", { cls: "al-serial-cover-candidate" }); button.type = "button";
        const image = button.createEl("img"); image.src = candidate.coverUrl; image.alt = candidate.title;
        button.createEl("small", { text: candidate.title }); button.createEl("small", { text: candidate.provider });
        button.addEventListener("click", () => {
          results.querySelectorAll(".is-selected").forEach((element) => element.removeClass("is-selected"));
          button.addClass("is-selected"); this.selected = candidate;
        });
      });
    };
    render(this.candidates);
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: serialCoverText("cancel") }).addEventListener("click", () => this.close());
    footer.createEl("button", { cls: "mod-cta", text: serialCoverText("apply") }).addEventListener("click", () => {
      if (!this.selected) return;
      void this.pluginRef.downloadCover(asResult(this.selected, this.context.mediaType)).then((cover) => {
        this.applyCover({ cover, provider: this.selected?.provider ?? "", sourceId: this.selected?.sourceId ?? "", manual: true });
        this.close();
      });
    });
  }
}

function configureRow(plugin: AnimeListPlugin, context: EditorContext, row: HTMLElement): void {
  if (row.dataset.serialCoverReady === "true") return;
  const labelInput = row.querySelector<HTMLInputElement>('.al-volume-row-fields input[type="text"]');
  if (!labelInput) return;
  row.dataset.serialCoverReady = "true";
  const panel = row.createDiv({ cls: "al-serial-cover-panel" });
  const coverButton = panel.createEl("button", { cls: "al-serial-cover-button" }); coverButton.type = "button";
  const status = panel.createEl("small", { cls: "al-serial-cover-status" });
  const actions = panel.createDiv({ cls: "al-serial-cover-actions" });
  const retry = actions.createEl("button"); retry.type = "button"; retry.setAttr("aria-label", serialCoverText("searchAgain")); setIcon(retry, "refresh-cw");
  const clear = actions.createEl("button"); clear.type = "button"; clear.setAttr("aria-label", serialCoverText("clear")); setIcon(clear, "x");
  const render = (): void => {
    coverButton.empty(); const stored = context.covers.get(labelInput.value.trim());
    if (stored) {
      const image = coverButton.createEl("img");
      image.src = plugin.resolveMediaCoverPath(stored.cover, context.editPath ?? "") || stored.cover;
      image.alt = `${context.originalTitle} ${labelInput.value}`;
      status.setText(stored.manual ? serialCoverText("manual") : serialCoverText("autoFound")); clear.hidden = false;
    } else { setIcon(coverButton, "image"); status.setText(serialCoverText("series")); clear.hidden = true; }
  };
  const search = async (manual: boolean): Promise<void> => {
    const label = labelInput.value.trim(); if (!serialCoverQuery(context.originalTitle, label)) return;
    status.setText(serialCoverText("loading"));
    try {
      const found = await loadBest(plugin, context, label);
      if (found.cover) { context.covers.set(label, found.cover); render(); }
      else if (manual) new CoverSelector(plugin, context, label, found.candidates, (cover) => { context.covers.set(label, cover); render(); }).open();
      else status.setText(serialCoverText("notFound"));
    } catch (error) { status.setText(serialCoverText("notFound")); if (manual) new Notice(error instanceof Error ? error.message : String(error)); }
  };
  retry.addEventListener("click", () => void search(true));
  coverButton.addEventListener("click", () => void search(true));
  clear.addEventListener("click", () => { context.covers.delete(labelInput.value.trim()); render(); });
  render();
  const label = labelInput.value.trim();
  if (context.originalTitle && !context.covers.has(label) && !context.attempted.has(label)) {
    context.attempted.add(label); void search(false);
  }
}
function configureRows(plugin: AnimeListPlugin, context: EditorContext): void {
  context.modal.querySelectorAll<HTMLElement>(".al-volume-row").forEach((row) => configureRow(plugin, context, row));
}

async function resolveOriginal(plugin: AnimeListPlugin, mediaType: "manga" | "novel", fm: Record<string, unknown>): Promise<string | null> {
  const stored = selectOriginalTitle(fm.title_original, fm.title_aliases); if (stored) return stored;
  const title = text(fm.title); if (!title) return null;
  const results = await plugin.searchAniList(mediaType, title);
  return results.map((result) => selectOriginalTitle(result.originalTitle, result.searchTitles)).find(Boolean) ?? null;
}
async function migrate(plugin: AnimeListPlugin, onProgress?: (progress: SerialCoverMigrationProgress) => void, signal?: AbortSignal): Promise<SerialCoverMigrationSummary> {
  const details: SerialCoverMigrationDetail[] = [];
  const jobs: Array<{ file: TFile; label: string }> = [];
  onProgress?.({ completed: 0, total: 0, phase: "scanning", message: "Scanning notes" });
  for (const file of getScopedMarkdownFiles(plugin.app, plugin.getScanFolders())) {
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if ((fm?.media_type !== "manga" && fm?.media_type !== "novel") || !Array.isArray(fm.volume_log)) continue;
    for (const raw of fm.volume_log) { const entry = record(raw); const label = text(entry?.label ?? entry?.volume).trim(); if (entry && label && !entry.cover) jobs.push({ file, label }); }
  }
  let completed = 0;
  for (const job of jobs) {
    if (signal?.aborted) break;
    const fm = plugin.app.metadataCache.getFileCache(job.file)?.frontmatter ?? {};
    const mediaType = fm.media_type === "manga" ? "manga" : "novel"; const title = text(fm.title) || job.file.basename;
    try {
      onProgress?.({ completed, total: jobs.length, phase: "resolving", message: `Resolving original title · ${title}` });
      const original = await resolveOriginal(plugin, mediaType, fm);
      const query = original ? serialCoverQuery(original, job.label) : null;
      if (!original || !query) { details.push({ filePath: job.file.path, title, label: job.label, status: "skipped", message: "Original title unavailable" }); completed += 1; continue; }
      if (!text(fm.title_original)) await plugin.app.fileManager.processFrontMatter(job.file, (frontmatter) => { frontmatter.title_original = original; });
      onProgress?.({ completed, total: jobs.length, phase: "loading", message: `Loading cover · ${title} · ${job.label}` });
      const context: EditorContext = { modal: document.body, editPath: job.file.path, mediaType, originalTitle: original, covers: new Map(), attempted: new Set() };
      const found = await loadBest(plugin, context, job.label);
      if (!found.cover) { details.push({ filePath: job.file.path, title, label: job.label, status: "not-found", message: serialCoverText("notFound") }); completed += 1; continue; }
      onProgress?.({ completed, total: jobs.length, phase: "saving", message: `Saving cover · ${title} · ${job.label}` });
      await plugin.app.fileManager.processFrontMatter(job.file, (frontmatter) => {
        if (!Array.isArray(frontmatter.volume_log)) return;
        frontmatter.volume_log = frontmatter.volume_log.map((raw) => {
          const entry = record(raw); if (!entry || text(entry.label ?? entry.volume).trim() !== job.label || entry.cover) return raw;
          return { ...entry, cover: found.cover?.cover, cover_provider: found.cover?.provider, cover_source_id: found.cover?.sourceId };
        });
      });
      details.push({ filePath: job.file.path, title, label: job.label, status: "loaded", message: found.cover.provider });
    } catch (error) { details.push({ filePath: job.file.path, title, label: job.label, status: "failed", message: error instanceof Error ? error.message : String(error) }); }
    completed += 1; onProgress?.({ completed, total: jobs.length, phase: "loading", message: `${completed} / ${jobs.length}` });
  }
  return { scanned: jobs.length, loaded: details.filter((x) => x.status === "loaded").length,
    notFound: details.filter((x) => x.status === "not-found").length, failed: details.filter((x) => x.status === "failed").length,
    skipped: details.filter((x) => x.status === "skipped").length + Math.max(0, jobs.length - details.length), details };
}

export function installSerialEntryCovers(plugin: SerialCoverPlugin): void {
  const contexts = new WeakMap<HTMLElement, EditorContext>();
  let activeEditPath: string | null = null; let pendingSave: EditorContext | null = null; let createResult: ExternalMediaResult | null = null;
  const originalOpenEdit = plugin.openEditModal.bind(plugin);
  plugin.openEditModal = (path: string): void => { activeEditPath = path; originalOpenEdit(path); };
  const originalOpenAdd = plugin.openAddModal.bind(plugin);
  plugin.openAddModal = (initialType: MediaType = "anime"): void => {
    const modalOpen = Modal.prototype.open; let captured: (Modal & { renderDetails?: (result: ExternalMediaResult) => Promise<void> }) | null = null;
    Modal.prototype.open = function capture(this: Modal): void { modalOpen.call(this); if (this.modalEl.classList.contains("animelist-modal")) captured = this; };
    try { originalOpenAdd(initialType); } finally { Modal.prototype.open = modalOpen; }
    if (!captured || typeof captured.renderDetails !== "function") return;
    const renderDetails = captured.renderDetails.bind(captured);
    captured.renderDetails = async (result: ExternalMediaResult) => { createResult = result; await renderDetails(result); configure(captured!.modalEl); };
  };
  const originalCreate = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const file = await originalCreate(result, form); const context = pendingSave; pendingSave = null;
    if (context) await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => mergeCovers(frontmatter, context.covers));
    return file;
  };
  const fileManager = plugin.app.fileManager; const priorProcess = fileManager.processFrontMatter.bind(fileManager);
  fileManager.processFrontMatter = async (file, callback): Promise<void> => {
    await priorProcess(file, callback); const context = pendingSave?.editPath === file.path ? pendingSave : null;
    if (context) { pendingSave = null; await priorProcess(file, (frontmatter) => mergeCovers(frontmatter, context.covers)); }
  };
  const configure = (modal: HTMLElement): void => {
    const existing = contexts.get(modal); if (existing) { configureRows(plugin, existing); return; }
    if (!modal.querySelector(".al-progress-unit-editor")) return;
    let fm: Record<string, unknown> = {}; let mediaType: "manga" | "novel" | null = null; let originalTitle = ""; let editPath: string | null = null;
    if (modal.classList.contains("animelist-edit-modal")) {
      editPath = activeEditPath; const file = editPath ? plugin.app.vault.getAbstractFileByPath(editPath) : null;
      if (file instanceof TFile) fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      mediaType = fm.media_type === "manga" ? "manga" : fm.media_type === "novel" ? "novel" : null;
      originalTitle = selectOriginalTitle(fm.title_original, fm.title_aliases) ?? "";
    } else if (createResult) {
      mediaType = createResult.mediaType === "manga" ? "manga" : createResult.mediaType === "novel" ? "novel" : null;
      originalTitle = selectOriginalTitle(createResult.originalTitle, createResult.searchTitles) ?? "";
    }
    if (!mediaType) return;
    const context = { modal, editPath, mediaType, originalTitle, covers: readCovers(fm.volume_log), attempted: new Set<string>() };
    contexts.set(modal, context); configureRows(plugin, context);
  };
  const observer = new MutationObserver(() => document.querySelectorAll<HTMLElement>(".animelist-modal").forEach(configure));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const click = (event: MouseEvent): void => {
    const target = event.target; if (!(target instanceof Element)) return;
    const modal = target.closest<HTMLButtonElement>("button.mod-cta")?.closest<HTMLElement>(".animelist-modal");
    const context = modal ? contexts.get(modal) : null; if (context) pendingSave = context;
  };
  document.addEventListener("click", click, true);
  plugin.loadMissingSerialCovers = (onProgress, signal) => migrate(plugin, onProgress, signal);
  plugin.register(() => { observer.disconnect(); document.removeEventListener("click", click, true);
    plugin.openEditModal = originalOpenEdit; plugin.openAddModal = originalOpenAdd; plugin.createMediaNote = originalCreate;
    fileManager.processFrontMatter = priorProcess; delete plugin.loadMissingSerialCovers; });
}

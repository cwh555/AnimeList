import { Modal, Notice, TFile, setIcon } from "obsidian";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import { SerialCoverLoadQueue } from "./serial-cover-load-queue";
import { renderSerialCoverCandidateRow } from "./serial-cover-picker";
import { SerialCoverSelection } from "./serial-cover-selection";
import { resolveSerialEntryCoverPaths } from "./serial-cover-timeline";
import type AnimeListPlugin from "./main";
import { selectOriginalTitle, serialCoverQuery, type RankedSerialCoverCandidate } from "./serial-entry-cover";
import {
  downloadSelectedSerialCover,
  findSerialCoverCandidates,
  loadConfidentSerialCover,
  loadMissingSerialCovers,
  mergeSerialCovers,
  readSerialCovers,
  type SerialCoverLookupContext,
  type SerialCoverPlugin,
  type StoredSerialCover,
} from "./serial-cover-service";
import { serialCoverText } from "./serial-cover-text";
import type { ExternalMediaResult, MediaType } from "./types";
import { uiText } from "./ui-text";

type AutomaticCoverStatus = "queued" | "loading" | "not-found" | "failed";

interface EditorContext extends SerialCoverLookupContext {
  modal: HTMLElement;
  editPath: string | null;
  covers: Map<string, StoredSerialCover>;
  knownLabels: Set<string>;
  attempted: Set<string>;
  autoQueue: SerialCoverLoadQueue;
  autoStatus: Map<string, AutomaticCoverStatus>;
  rowRenders: Map<HTMLInputElement, () => void>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function refreshRows(context: EditorContext): void {
  for (const [input, render] of context.rowRenders) {
    if (!input.isConnected) {
      context.rowRenders.delete(input);
      continue;
    }
    render();
  }
}

class CoverSelector extends Modal {
  private readonly selection: SerialCoverSelection;
  private candidates: RankedSerialCoverCandidate[];
  private query: string;

  constructor(
    private pluginRef: AnimeListPlugin,
    private context: EditorContext,
    private label: string,
    candidates: RankedSerialCoverCandidate[],
    private applyCover: (cover: StoredSerialCover) => void,
  ) {
    super(pluginRef.app);
    this.candidates = [...candidates];
    this.selection = new SerialCoverSelection(this.candidates);
    this.query = serialCoverQuery(context.originalTitle, label) ?? context.originalTitle;
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-serial-cover-modal");
    this.titleEl.setText(serialCoverText("selectorTitle", { unit: "entry", label: this.label }));
    this.contentEl.empty();

    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: serialCoverText("selectorDescription"),
    });

    const searchRow = this.contentEl.createDiv({ cls: "al-modal-search-row" });
    const input = searchRow.createEl("input", { type: "search" });
    input.value = this.query;
    input.placeholder = serialCoverText("searchPlaceholder");
    const searchButton = searchRow.createEl("button", {
      cls: "mod-cta",
      text: uiText("action.search"),
    });
    searchButton.type = "button";

    this.contentEl.createEl("p", {
      cls: "al-modal-hint",
      text: serialCoverText("searchHint"),
    });
    const results = this.contentEl.createDiv({ cls: "al-search-results" });
    const footer = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const cancelButton = footer.createEl("button", { text: uiText("action.cancel") });
    cancelButton.type = "button";
    const applyButton = footer.createEl("button", {
      cls: "mod-cta",
      text: serialCoverText("apply"),
    });
    applyButton.type = "button";

    let searching = false;

    const updateControls = (): void => {
      input.disabled = searching || this.selection.isApplying;
      searchButton.disabled = searching || this.selection.isApplying;
      searchButton.setText(searching ? serialCoverText("searching") : uiText("action.search"));
      cancelButton.disabled = this.selection.isApplying;
      applyButton.disabled = searching || !this.selection.canApply;
      applyButton.setText(this.selection.isApplying
        ? serialCoverText("applying")
        : serialCoverText("apply"));
    };

    const renderResults = (): void => {
      results.empty();
      const selected = this.selection.selectedCandidate;
      if (!this.candidates.length) {
        results.createDiv({ cls: "al-search-empty", text: serialCoverText("emptyResult") });
        updateControls();
        return;
      }

      results.setAttribute("role", "listbox");
      for (const candidate of this.candidates) {
        renderSerialCoverCandidateRow(results, candidate, {
          selected: selected?.sourceId === candidate.sourceId,
          selectLabel: uiText("action.select"),
          matchLabel: serialCoverText("matchScore", { score: Math.round(candidate.score) }),
          onSelect: () => {
            this.selection.select(candidate);
            renderResults();
          },
        });
      }
      updateControls();
    };

    const runSearch = async (): Promise<void> => {
      const query = input.value.trim();
      if (!query) {
        new Notice(serialCoverText("searchPlaceholder"));
        return;
      }
      searching = true;
      updateControls();
      try {
        this.query = query;
        this.candidates = await findSerialCoverCandidates(this.context, this.label, query);
        this.selection.replace(this.candidates);
        renderResults();
        if (!this.candidates.length) new Notice(serialCoverText("emptyResult"));
      } catch (error) {
        console.error("AnimeList serial cover search failed", error);
        this.candidates = [];
        this.selection.replace([]);
        renderResults();
        new Notice(error instanceof Error ? error.message : serialCoverText("notFound"));
      } finally {
        searching = false;
        updateControls();
      }
    };

    searchButton.addEventListener("click", () => void runSearch());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void runSearch();
    });
    cancelButton.addEventListener("click", () => this.close());
    applyButton.addEventListener("click", () => {
      if (!this.selection.selectedCandidate) {
        new Notice(serialCoverText("selectCandidate"));
        return;
      }
      updateControls();
      void this.selection.apply((candidate) => (
        downloadSelectedSerialCover(this.pluginRef, this.context, candidate, true)
      )).then((cover) => {
        if (!cover) return;
        this.applyCover(cover);
        this.close();
      }).catch((error) => {
        console.error("AnimeList serial cover apply failed", error);
        new Notice(error instanceof Error ? error.message : serialCoverText("applyFailed"));
      }).finally(updateControls);
      updateControls();
    });

    renderResults();
    updateControls();
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
}

function scheduleAutomaticCover(
  plugin: AnimeListPlugin,
  context: EditorContext,
  label: string,
): void {
  if (!serialCoverQuery(context.originalTitle, label)) return;
  if (context.covers.has(label) || context.attempted.has(label)) return;
  context.attempted.add(label);
  context.autoStatus.set(label, "queued");
  refreshRows(context);

  void context.autoQueue.enqueue(label, async () => {
    context.autoStatus.set(label, "loading");
    refreshRows(context);
    return loadConfidentSerialCover(plugin, context, label);
  }).then((cover) => {
    if (cover) {
      context.covers.set(label, cover);
      context.autoStatus.delete(label);
    } else {
      context.autoStatus.set(label, "not-found");
    }
  }).catch((error) => {
    console.error(`AnimeList serial cover automatic lookup failed for ${label}`, error);
    context.autoStatus.set(label, "failed");
  }).finally(() => refreshRows(context));
}

function configureRow(plugin: AnimeListPlugin, context: EditorContext, row: HTMLElement): void {
  if (row.dataset.serialCoverReady === "true") return;
  const labelInput = row.querySelector<HTMLInputElement>('.al-volume-row-fields input[type="text"]');
  if (!labelInput) return;
  row.dataset.serialCoverReady = "true";

  const panel = row.createDiv({ cls: "al-serial-cover-panel" });
  const coverButton = panel.createEl("button", { cls: "al-serial-cover-button" });
  coverButton.type = "button";
  const status = panel.createEl("small", { cls: "al-serial-cover-status" });
  const actions = panel.createDiv({ cls: "al-serial-cover-actions" });
  const retry = actions.createEl("button");
  retry.type = "button";
  retry.setAttribute("aria-label", serialCoverText("searchAgain"));
  setIcon(retry, "refresh-cw");
  const clear = actions.createEl("button");
  clear.type = "button";
  clear.setAttribute("aria-label", serialCoverText("clear"));
  setIcon(clear, "x");

  const render = (): void => {
    coverButton.empty();
    const label = labelInput.value.trim();
    const stored = context.covers.get(label);
    if (!stored) {
      setIcon(coverButton, "image");
      const automaticStatus = context.autoStatus.get(label);
      status.setText(automaticStatus === "queued"
        ? serialCoverText("queued")
        : automaticStatus === "loading"
          ? serialCoverText("loading")
          : automaticStatus === "not-found" || automaticStatus === "failed"
            ? serialCoverText("notFound")
            : serialCoverText("series"));
      clear.hidden = true;
      return;
    }
    const image = coverButton.createEl("img");
    image.src = plugin.resolveMediaCoverPath(stored.cover, context.editPath ?? "") || stored.cover;
    image.alt = `${context.originalTitle} ${labelInput.value}`;
    status.setText(stored.manual ? serialCoverText("manual") : serialCoverText("autoFound"));
    clear.hidden = false;
  };
  context.rowRenders.set(labelInput, render);

  const search = async (): Promise<void> => {
    const label = labelInput.value.trim();
    const query = serialCoverQuery(context.originalTitle, label);
    if (!query) return;
    status.setText(serialCoverText("loading"));
    try {
      const candidates = await findSerialCoverCandidates(context, label);
      new CoverSelector(plugin, context, label, candidates, (cover) => {
        context.covers.set(label, cover);
        context.autoStatus.delete(label);
        refreshRows(context);
      }).open();
      status.setText(candidates.length ? serialCoverText("series") : serialCoverText("notFound"));
    } catch (error) {
      status.setText(serialCoverText("notFound"));
      new Notice(error instanceof Error ? error.message : String(error));
    }
  };

  const scheduleCurrentLabel = (): void => {
    const label = labelInput.value.trim();
    if (!label || context.knownLabels.has(label)) return;
    context.knownLabels.add(label);
    scheduleAutomaticCover(plugin, context, label);
  };

  retry.addEventListener("click", () => void search());
  coverButton.addEventListener("click", () => void search());
  clear.addEventListener("click", () => {
    context.covers.delete(labelInput.value.trim());
    context.autoStatus.delete(labelInput.value.trim());
    render();
  });
  labelInput.addEventListener("input", render);
  labelInput.addEventListener("change", scheduleCurrentLabel);
  render();
  scheduleCurrentLabel();
}

function configureRows(plugin: AnimeListPlugin, context: EditorContext): void {
  context.modal.querySelectorAll<HTMLElement>(".al-progress-unit-editor .al-volume-row")
    .forEach((row) => configureRow(plugin, context, row));
}

export function installSerialEntryCovers(plugin: SerialCoverPlugin): void {
  configureSerialCoverProvider({ apiKey: plugin.settings.googleBooksApiKey });
  const contexts = new WeakMap<HTMLElement, EditorContext>();
  let activeEditPath: string | null = null;
  let pendingSave: EditorContext | null = null;
  let createResult: ExternalMediaResult | null = null;

  const originalCollectMediaItems = plugin.collectMediaItems.bind(plugin);
  plugin.collectMediaItems = (source?: string) => originalCollectMediaItems(source).map((item) => ({
    ...item,
    volumeLog: resolveSerialEntryCoverPaths(item.volumeLog, (cover) => (
      plugin.resolveMediaCoverPath(cover, item.filePath)
    )),
  }));

  const originalOpenEdit = plugin.openEditModal.bind(plugin);
  plugin.openEditModal = (path: string): void => {
    activeEditPath = path;
    originalOpenEdit(path);
  };

  const configure = (modal: HTMLElement): void => {
    const existing = contexts.get(modal);
    if (existing) {
      configureRows(plugin, existing);
      return;
    }
    if (!modal.querySelector(".al-progress-unit-editor")) return;

    let frontmatter: Record<string, unknown> = {};
    let mediaType: "manga" | "novel" | null = null;
    let originalTitle = "";
    let editPath: string | null = null;
    if (modal.classList.contains("animelist-edit-modal")) {
      editPath = activeEditPath;
      const file = editPath ? plugin.app.vault.getAbstractFileByPath(editPath) : null;
      if (file instanceof TFile) {
        frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      }
      mediaType = frontmatter.media_type === "manga"
        ? "manga"
        : frontmatter.media_type === "novel" ? "novel" : null;
      originalTitle = selectOriginalTitle(frontmatter.title_original, frontmatter.title_aliases) ?? "";
    } else if (createResult) {
      mediaType = createResult.mediaType === "manga"
        ? "manga"
        : createResult.mediaType === "novel" ? "novel" : null;
      originalTitle = selectOriginalTitle(createResult.originalTitle, createResult.searchTitles) ?? "";
    }
    if (!mediaType) return;

    const existingEntries = list(frontmatter.volume_log);
    const context: EditorContext = {
      modal,
      editPath,
      mediaType,
      originalTitle,
      covers: readSerialCovers(existingEntries),
      knownLabels: new Set(existingEntries.flatMap((raw) => {
        const entry = record(raw);
        const label = text(entry?.label ?? entry?.volume).trim();
        return label ? [label] : [];
      })),
      attempted: new Set(),
      autoQueue: new SerialCoverLoadQueue(),
      autoStatus: new Map(),
      rowRenders: new Map(),
    };
    contexts.set(modal, context);
    configureRows(plugin, context);
  };

  const originalOpenAdd = plugin.openAddModal.bind(plugin);
  plugin.openAddModal = (initialType: MediaType = "anime"): void => {
    const modalOpen = Modal.prototype.open;
    const captured: Array<Modal & { renderDetails?: (result: ExternalMediaResult) => Promise<void> }> = [];
    Modal.prototype.open = function capture(this: Modal): void {
      modalOpen.call(this);
      if (this.modalEl.classList.contains("animelist-modal")) captured.push(this);
    };
    try {
      originalOpenAdd(initialType);
    } finally {
      Modal.prototype.open = modalOpen;
    }
    const modal = captured.at(-1);
    if (!modal || typeof modal.renderDetails !== "function") return;
    const renderDetails = modal.renderDetails.bind(modal);
    modal.renderDetails = async (result: ExternalMediaResult) => {
      createResult = result;
      await renderDetails(result);
      configure(modal.modalEl);
    };
  };

  const originalCreate = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const file = await originalCreate(result, form);
    const context = pendingSave;
    pendingSave = null;
    if (context) {
      await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        mergeSerialCovers(frontmatter, context.covers);
      });
    }
    return file;
  };

  const fileManager = plugin.app.fileManager;
  const originalProcess = fileManager.processFrontMatter.bind(fileManager);
  fileManager.processFrontMatter = async (file, callback): Promise<void> => {
    await originalProcess(file, callback);
    const context = pendingSave?.editPath === file.path ? pendingSave : null;
    if (!context) return;
    pendingSave = null;
    await originalProcess(file, (frontmatter) => mergeSerialCovers(frontmatter, context.covers));
  };

  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLElement>(".animelist-modal").forEach(configure);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const saveCapture = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const modal = target.closest<HTMLButtonElement>(".al-modal-actions > button.mod-cta")
      ?.closest<HTMLElement>(".animelist-modal");
    const context = modal ? contexts.get(modal) : null;
    if (context) pendingSave = context;
  };
  document.addEventListener("click", saveCapture, true);
  plugin.loadMissingSerialCovers = (onProgress, signal) => (
    loadMissingSerialCovers(plugin, onProgress, signal)
  );

  plugin.register(() => {
    observer.disconnect();
    document.removeEventListener("click", saveCapture, true);
    plugin.collectMediaItems = originalCollectMediaItems;
    plugin.openEditModal = originalOpenEdit;
    plugin.openAddModal = originalOpenAdd;
    plugin.createMediaNote = originalCreate;
    fileManager.processFrontMatter = originalProcess;
    delete plugin.loadMissingSerialCovers;
  });
}

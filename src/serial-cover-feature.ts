import { Modal, Notice, TFile, setIcon } from "obsidian";
import { configureSerialCoverProvider } from "./serial-cover-provider";
import { SerialCoverSelection } from "./serial-cover-selection";
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

interface EditorContext extends SerialCoverLookupContext {
  modal: HTMLElement;
  editPath: string | null;
  covers: Map<string, StoredSerialCover>;
  knownLabels: Set<string>;
  attempted: Set<string>;
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

class CoverSelector extends Modal {
  private readonly selection: SerialCoverSelection;

  constructor(
    private pluginRef: AnimeListPlugin,
    private context: EditorContext,
    private label: string,
    private candidates: RankedSerialCoverCandidate[],
    private applyCover: (cover: StoredSerialCover) => void,
  ) {
    super(pluginRef.app);
    this.selection = new SerialCoverSelection(candidates);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-serial-cover-modal");
    this.titleEl.setText(serialCoverText("selectorTitle", { unit: "entry", label: this.label }));
    const field = this.contentEl.createEl("label", { cls: "al-form-field" });
    field.createEl("span", { cls: "al-form-label", text: serialCoverText("query") });
    const input = field.createEl("input", { type: "text" });
    input.value = serialCoverQuery(this.context.originalTitle, this.label) ?? "";
    input.readOnly = true;

    const results = this.contentEl.createDiv({ cls: "al-serial-cover-results" });
    for (const [index, candidate] of this.candidates.entries()) {
      const button = results.createEl("button", { cls: "al-serial-cover-candidate" });
      button.type = "button";
      if (index === 0) button.addClass("is-selected");
      const image = button.createEl("img");
      image.src = candidate.coverUrl;
      image.alt = candidate.title;
      button.createEl("small", { text: candidate.title });
      button.createEl("small", { text: candidate.provider });
      button.addEventListener("click", () => {
        results.querySelectorAll(".is-selected")
          .forEach((element) => element.classList.remove("is-selected"));
        button.addClass("is-selected");
        this.selection.select(candidate);
        applyButton.disabled = !this.selection.canApply;
      });
    }

    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancelButton = footer.createEl("button", { text: serialCoverText("cancel") });
    cancelButton.addEventListener("click", () => this.close());
    const applyButton = footer.createEl("button", { cls: "mod-cta", text: serialCoverText("apply") });
    applyButton.disabled = !this.selection.canApply;
    applyButton.addEventListener("click", () => {
      if (!this.selection.selectedCandidate) {
        new Notice(serialCoverText("selectCandidate"));
        return;
      }
      applyButton.disabled = true;
      cancelButton.disabled = true;
      applyButton.setText(serialCoverText("applying"));
      void this.selection.apply((candidate) => (
        downloadSelectedSerialCover(this.pluginRef, this.context, candidate, true)
      )).then((cover) => {
        if (!cover) return;
        this.applyCover(cover);
        this.close();
      }).catch((error) => {
        console.error("AnimeList serial cover apply failed", error);
        new Notice(error instanceof Error ? error.message : serialCoverText("applyFailed"));
      }).finally(() => {
        applyButton.setText(serialCoverText("apply"));
        applyButton.disabled = !this.selection.canApply;
        cancelButton.disabled = false;
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
    const stored = context.covers.get(labelInput.value.trim());
    if (!stored) {
      setIcon(coverButton, "image");
      status.setText(serialCoverText("series"));
      clear.hidden = true;
      return;
    }
    const image = coverButton.createEl("img");
    image.src = plugin.resolveMediaCoverPath(stored.cover, context.editPath ?? "") || stored.cover;
    image.alt = `${context.originalTitle} ${labelInput.value}`;
    status.setText(stored.manual ? serialCoverText("manual") : serialCoverText("autoFound"));
    clear.hidden = false;
  };

  const search = async (manual: boolean): Promise<void> => {
    const label = labelInput.value.trim();
    if (!serialCoverQuery(context.originalTitle, label)) return;
    status.setText(serialCoverText("loading"));
    try {
      if (manual) {
        const candidates = await findSerialCoverCandidates(context, label);
        new CoverSelector(plugin, context, label, candidates, (cover) => {
          context.covers.set(label, cover);
          render();
        }).open();
        status.setText(candidates.length ? serialCoverText("series") : serialCoverText("notFound"));
        return;
      }
      const cover = await loadConfidentSerialCover(plugin, context, label);
      if (cover) {
        context.covers.set(label, cover);
        render();
      } else {
        status.setText(serialCoverText("notFound"));
      }
    } catch (error) {
      status.setText(serialCoverText("notFound"));
      if (manual) new Notice(error instanceof Error ? error.message : String(error));
    }
  };

  retry.addEventListener("click", () => void search(true));
  coverButton.addEventListener("click", () => void search(true));
  clear.addEventListener("click", () => {
    context.covers.delete(labelInput.value.trim());
    render();
  });
  labelInput.addEventListener("input", render);
  render();

  const label = labelInput.value.trim();
  const isNewLabel = Boolean(label) && !context.knownLabels.has(label);
  context.knownLabels.add(label);
  if (isNewLabel && context.originalTitle && !context.covers.has(label) && !context.attempted.has(label)) {
    context.attempted.add(label);
    void search(false);
  }
}

function configureRows(plugin: AnimeListPlugin, context: EditorContext): void {
  context.modal.querySelectorAll<HTMLElement>(".al-volume-row")
    .forEach((row) => configureRow(plugin, context, row));
}

export function installSerialEntryCovers(plugin: SerialCoverPlugin): void {
  configureSerialCoverProvider({ apiKey: plugin.settings.googleBooksApiKey });
  const contexts = new WeakMap<HTMLElement, EditorContext>();
  let activeEditPath: string | null = null;
  let pendingSave: EditorContext | null = null;
  let createResult: ExternalMediaResult | null = null;

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
    const modal = target.closest<HTMLButtonElement>("button.mod-cta")
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
    plugin.openEditModal = originalOpenEdit;
    plugin.openAddModal = originalOpenAdd;
    plugin.createMediaNote = originalCreate;
    fileManager.processFrontMatter = originalProcess;
    delete plugin.loadMissingSerialCovers;
  });
}

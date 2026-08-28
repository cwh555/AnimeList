import { Modal, Notice, setIcon } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { configureSerialCoverProvider } from "../../data/serial-covers/provider";
import { directlyApplySerialCover, SerialCoverDirectApply } from "../../app/serial-covers/direct-apply";
import { SerialCoverLoadQueue } from "../../app/serial-covers/load-queue";
import { renderSerialCoverCandidateRow } from "../../ui/serial-covers/picker";
import { resolveSerialEntryCoverPaths } from "../../domain/serial-covers/timeline";
import { selectOriginalTitle, serialCoverQuery, type RankedSerialCoverCandidate } from "../../domain/serial-covers/ranking";
import {
  downloadSelectedSerialCover,
  findSerialCoverCandidates,
  loadConfidentSerialCover,
  readSerialCovers,
  type SerialCoverLookupContext,
  type StoredSerialCover,
} from "../../app/serial-covers/serial-cover-service";
import { serialCoverText } from "./text";
import { bindImageFallback } from "../../ui/image-fallback";
import { makeEl } from "../../ui/ui-helpers";
import { READING_EDITOR_STATE_KEY, type ReadingProgressEditorState } from "../progress/additional-progress-units";
import type { MediaFormContext, MediaFormSubmitContext } from "../../ui/media-form-contracts";
import type { NovelVolumeEntry } from "../../types";
import { uiText } from "../../ui-text";

const SERIAL_COVER_EDITOR_STATE_KEY = "serial-cover-editor";
type AutomaticCoverStatus = "queued" | "loading" | "not-found" | "failed";

interface EditorContext extends SerialCoverLookupContext {
  host: AnimeListFeatureHost;
  form: MediaFormContext<AnimeListFeatureHost>;
  reading: ReadingProgressEditorState;
  covers: Map<string, StoredSerialCover>;
  knownLabels: Set<string>;
  attempted: Set<string>;
  autoQueue: SerialCoverLoadQueue;
  autoStatus: Map<string, AutomaticCoverStatus>;
  rowRenders: Map<HTMLInputElement, () => void>;
}

function storedCover(entry: NovelVolumeEntry): StoredSerialCover | null {
  if (!entry.cover) return null;
  return {
    cover: entry.cover,
    provider: entry.coverProvider ?? "",
    sourceId: entry.coverSourceId ?? "",
    manual: entry.coverManual === true,
  };
}

export function applySerialCovers(
  entries: readonly NovelVolumeEntry[],
  covers: ReadonlyMap<string, StoredSerialCover>,
): NovelVolumeEntry[] {
  return entries.map((entry) => {
    const cover = covers.get(entry.label);
    if (!cover) {
      const { cover: _cover, coverProvider: _provider, coverSourceId: _source, coverManual: _manual, ...rest } = entry;
      return rest;
    }
    return {
      ...entry,
      cover: cover.cover,
      coverProvider: cover.provider || undefined,
      coverSourceId: cover.sourceId || undefined,
      coverManual: cover.manual || undefined,
    };
  });
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
  private readonly directApply = new SerialCoverDirectApply();
  private candidates: RankedSerialCoverCandidate[];
  private query: string;

  constructor(
    private readonly host: AnimeListFeatureHost,
    private readonly context: EditorContext,
    private readonly label: string,
    candidates: RankedSerialCoverCandidate[],
    private readonly applyCover: (cover: StoredSerialCover) => void,
  ) {
    super(host.app);
    this.candidates = [...candidates];
    this.query = serialCoverQuery(context.originalTitle, label) ?? context.originalTitle;
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-serial-cover-modal");
    this.titleEl.setText(serialCoverText("selectorTitle", { unit: serialCoverText("entryUnit"), label: this.label }));
    this.contentEl.empty();
    this.contentEl.createEl("p", { cls: "al-modal-hint", text: serialCoverText("selectorDescription") });

    const searchRow = this.contentEl.createDiv({ cls: "al-modal-search-row" });
    const input = searchRow.createEl("input", { type: "search" });
    input.value = this.query;
    input.placeholder = serialCoverText("searchPlaceholder");
    const searchButton = searchRow.createEl("button", { cls: "mod-cta", text: uiText("action.search") });
    searchButton.type = "button";
    this.contentEl.createEl("p", { cls: "al-modal-hint", text: serialCoverText("searchHint") });
    const results = this.contentEl.createDiv({ cls: "al-search-results" });
    let searching = false;

    const updateControls = (): void => {
      const busy = searching || this.directApply.isApplying;
      input.disabled = busy;
      searchButton.disabled = busy;
      searchButton.setText(searching ? serialCoverText("searching") : uiText("action.search"));
    };
    const renderResults = (): void => {
      results.empty();
      if (!this.candidates.length) results.createDiv({ cls: "al-search-empty", text: serialCoverText("emptyResult") });
      for (const candidate of this.candidates) {
        const applying = this.directApply.activeSourceId === candidate.sourceId;
        renderSerialCoverCandidateRow(results, candidate, {
          disabled: searching || this.directApply.isApplying,
          applying,
          matchLabel: applying ? serialCoverText("applying") : serialCoverText("matchScore", { score: Math.round(candidate.score) }),
          onChoose: () => void chooseCandidate(candidate),
        });
      }
      updateControls();
    };
    const chooseCandidate = async (candidate: RankedSerialCoverCandidate): Promise<void> => {
      if (searching || this.directApply.isApplying) return;
      const operation = directlyApplySerialCover(
        this.directApply,
        candidate,
        (selected) => downloadSelectedSerialCover(this.host, this.context, selected, true),
        this.applyCover,
        () => this.close(),
      );
      renderResults();
      try {
        await operation;
      } catch (error) {
        console.error("AnimeList serial cover apply failed", error);
        new Notice(error instanceof Error ? error.message : serialCoverText("applyFailed"));
      } finally {
        renderResults();
      }
    };
    const runSearch = async (): Promise<void> => {
      const query = input.value.trim();
      if (!query) {
        new Notice(serialCoverText("searchPlaceholder"));
        return;
      }
      searching = true;
      renderResults();
      try {
        this.query = query;
        this.candidates = await findSerialCoverCandidates(this.context, this.label, query);
        if (!this.candidates.length) new Notice(serialCoverText("emptyResult"));
      } catch (error) {
        console.error("AnimeList serial cover search failed", error);
        this.candidates = [];
        new Notice(error instanceof Error ? error.message : serialCoverText("notFound"));
      } finally {
        searching = false;
        renderResults();
      }
    };

    searchButton.addEventListener("click", () => void runSearch());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void runSearch();
    });
    renderResults();
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }
}

function scheduleAutomaticCover(context: EditorContext, label: string): void {
  if (!serialCoverQuery(context.originalTitle, label)) return;
  if (context.covers.has(label) || context.attempted.has(label)) return;
  context.attempted.add(label);
  context.autoStatus.set(label, "queued");
  refreshRows(context);
  void context.autoQueue.enqueue(label, async () => {
    context.autoStatus.set(label, "loading");
    refreshRows(context);
    return loadConfidentSerialCover(context.host, context, label);
  }).then((cover) => {
    if (cover) {
      context.covers.set(label, cover);
      context.autoStatus.delete(label);
    } else context.autoStatus.set(label, "not-found");
  }).catch((error: unknown) => {
    console.error(`AnimeList serial cover automatic lookup failed for ${label}`, error);
    context.autoStatus.set(label, "failed");
  }).finally(() => refreshRows(context));
}

function configureRow(context: EditorContext, row: HTMLElement): void {
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
      const automatic = context.autoStatus.get(label);
      status.setText(automatic === "queued" ? serialCoverText("queued")
        : automatic === "loading" ? serialCoverText("loading")
          : automatic === "not-found" || automatic === "failed" ? serialCoverText("notFound")
            : serialCoverText("series"));
      clear.hidden = true;
      return;
    }
    const image = coverButton.createEl("img");
    image.alt = `${context.originalTitle} ${labelInput.value}`;
    bindImageFallback(image, () => {
      const missing = makeEl("span");
      setIcon(missing, "image-off");
      status.setText(serialCoverText("notFound"));
      return missing;
    });
    image.src = context.host.resolveMediaCoverPath(stored.cover, context.form.file?.path ?? "") || stored.cover;
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
      const candidates = await findSerialCoverCandidates(context, label, query);
      new CoverSelector(context.host, context, label, candidates, (cover) => {
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
    scheduleAutomaticCover(context, label);
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

function configureRows(context: EditorContext): void {
  context.reading.editor.querySelectorAll<HTMLElement>(".al-volume-row")
    .forEach((row) => configureRow(context, row));
}

function readingState(context: MediaFormContext<AnimeListFeatureHost>): ReadingProgressEditorState | null {
  const value = context.state.get(READING_EDITOR_STATE_KEY);
  return value && typeof value === "object" && "editor" in value
    ? value as ReadingProgressEditorState
    : null;
}

function configureSerialEditor(form: MediaFormContext<AnimeListFeatureHost>): void {
  const reading = readingState(form);
  if (!reading || (form.mediaType !== "manga" && form.mediaType !== "novel")) return;
  const originalTitle = selectOriginalTitle(
    form.result?.originalTitle ?? form.frontmatter.title_original,
    form.result?.searchTitles ?? form.frontmatter.title_aliases,
  ) ?? reading.originalTitle;
  const covers = readSerialCovers(reading.entries);
  const context: EditorContext = {
    host: form.host,
    form,
    reading,
    mediaType: form.mediaType,
    originalTitle,
    covers,
    knownLabels: new Set(reading.entries.map((entry) => entry.label)),
    attempted: new Set(),
    autoQueue: new SerialCoverLoadQueue(),
    autoStatus: new Map(),
    rowRenders: new Map(),
  };
  for (const entry of reading.entries) {
    const stored = storedCover(entry);
    if (stored) context.covers.set(entry.label, stored);
  }
  form.state.set(SERIAL_COVER_EDITOR_STATE_KEY, context);
  reading.listeners.add(() => configureRows(context));
  configureRows(context);
}

function prepareSerialSubmit(form: MediaFormSubmitContext<AnimeListFeatureHost>): void {
  const value = form.state.get(SERIAL_COVER_EDITOR_STATE_KEY);
  if (!value || typeof value !== "object" || !("covers" in value)) return;
  const context = value as EditorContext;
  form.form.volumeLog = applySerialCovers(form.form.volumeLog, context.covers);
}

export const serialEntryCoversFeature = defineFeature<AnimeListFeatureHost>({
  id: "serial-entry-covers",
  dependsOn: ["progress-units"],
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      configureSerialCoverProvider({ apiKey: host.settings.googleBooksApiKey });
    },
  }, {
    kind: "media-item",
    decorate(item, host) {
      return {
        ...item,
        volumeLog: resolveSerialEntryCoverPaths(item.volumeLog, (cover) => (
          host.resolveMediaCoverPath(cover, item.filePath)
        )),
      };
    },
  }, {
    kind: "media-form",
    configure: configureSerialEditor,
    prepareSubmit: prepareSerialSubmit,
  }],
});

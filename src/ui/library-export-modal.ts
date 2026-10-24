import { AnimeListModal } from "./animelist-modal";
import { Notice } from "obsidian";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import {
  buildLibraryTextExportRows,
  filterLibraryExportItems,
  type LibraryExportFormat,
  type LibraryExportScope,
} from "../domain/library-export";
import {
  normalizeSpecialLabelMode,
  type SpecialLabelMode,
} from "../domain/masterpiece-labels";
import { LibraryExportService } from "../data/library-export-service";
import {
  compileLibraryTextExportTemplate,
  defaultLibraryTextExportTemplate,
  formatLibraryTextExport,
  libraryTextTemplateIssueMessage,
} from "../features/library-export/format";
import { libraryExportText } from "../features/library-export/text";
import { uiText } from "../ui-text";
import {
  buildPresentationDocument, formatPresentationText, rankingLabelsForLibrary,
  type PresentationDocument, type PresentationKind, type PresentationMediaType,
} from "../domain/presentation-export";
import { PairwiseRankingStore } from "../data/pairwise-ranking/store";
import type { RankingState } from "../domain/pairwise-ranking";
import { PresentationExportService } from "../data/presentation-export-service";
import { rasterizePresentation, type PresentationTheme } from "./presentation-export-raster";
import { errorMessage, makeEl } from "./ui-helpers";
import { createLibraryExportOptions, type LibraryExportOptionsView } from "./library-export-options";
import {
  createLibraryExportPreview,
  type LibraryExportOutput,
  type LibraryExportPreviewView,
} from "./library-export-preview";

export interface ExportPreset {
  kind?: "library" | PresentationKind;
  mediaType?: PresentationMediaType;
}
interface PresentationSelection {
  kind: PresentationKind;
  format: "text" | "png";
  mediaType: PresentationMediaType;
  theme: PresentationTheme;
  includeUnrated: boolean;
  top: number | null;
}
interface LibraryExportModalState {
  format: LibraryExportFormat;
  scope: LibraryExportScope;
  textTemplate: string;
}

export class LibraryExportModal extends AnimeListModal {
  private readonly service: LibraryExportService;
  private readonly specialLabelMode: SpecialLabelMode;
  private readonly exportedAt = new Date().toISOString();
  private readonly presentationService: PresentationExportService;
  private readonly rankingStore: PairwiseRankingStore;
  private ranking: RankingState | null = null;
  private rankingError: string | null = null;
  private rankingLoaded = false;
  private activeKind: "library" | PresentationKind = "library";
  private readonly presentation: PresentationSelection = {
    kind: "scoreboard", format: "text", mediaType: "anime",
    theme: "light", includeUnrated: false, top: null,
  };
  private readonly presentationButtons: Array<HTMLSelectElement | HTMLInputElement> = [];
  private libraryControls: HTMLElement | null = null;
  private libraryPreview: HTMLElement | null = null;
  private presentationControls: HTMLElement | null = null;
  private presentationPreview: HTMLElement | null = null;
  private presentationText: HTMLTextAreaElement | null = null;
  private presentationImage: HTMLImageElement | null = null;
  private presentationNote: HTMLElement | null = null;
  private presentationOutput = "";
  private pngPages: Blob[] | null = null;
  private previewUrl: string | null = null;
  private renderEpoch = 0;
  private readonly state: LibraryExportModalState = {
    format: "json",
    scope: { mediaType: "all", status: "all" },
    textTemplate: defaultLibraryTextExportTemplate(),
  };
  private items: MediaItem[] = [];
  private optionsView: LibraryExportOptionsView | null = null;
  private previewView: LibraryExportPreviewView | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(private readonly host: AnimeListFeatureHost, preset: ExportPreset = {}) {
    super(host.app);
    this.service = new LibraryExportService(host);
    this.presentationService = new PresentationExportService(host);
    this.rankingStore = new PairwiseRankingStore(host.app);
    this.specialLabelMode = normalizeSpecialLabelMode(host.settings.specialLabelMode);
    this.activeKind = preset.kind ?? "library";
    if (this.activeKind !== "library") this.presentation.kind = this.activeKind;
    this.presentation.mediaType = preset.mediaType ?? "anime";
    if (this.presentation.kind === "ranking" && this.presentation.mediaType === "all") {
      this.presentation.mediaType = "anime";
    }
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "al-library-export-modal");
    Object.assign(this.modalEl.style, {
      width: "min(980px, calc(100vw - 28px))",
      maxWidth: "980px",
      boxSizing: "border-box",
    });
    this.titleEl.textContent = libraryExportText("title");
    this.items = this.host.collectMediaItems();
    this.buildView();
    void this.rankingStore.load().then((ranking) => {
      this.ranking = ranking;
      this.rankingLoaded = true;
      if (this.contentEl.isConnected) this.syncView();
    }).catch((error: unknown) => {
      this.rankingError = errorMessage(error);
      this.rankingLoaded = true;
      if (this.contentEl.isConnected) this.syncView();
    });
  }

  private output(): LibraryExportOutput {
    const items = filterLibraryExportItems(this.items, this.state.scope);
    if (this.state.format === "json") {
      return { content: this.service.createJson(items, this.exportedAt), count: items.length };
    }
    const labels = rankingLabelsForLibrary(this.items, this.ranking);
    const rows = buildLibraryTextExportRows(items).map((row) => ({
      ...row, ranking: labels.get(row.path) ?? "",
    }));
    const compilation = compileLibraryTextExportTemplate(this.state.textTemplate, this.specialLabelMode);
    return {
      content: formatLibraryTextExport(
        rows,
        this.state.textTemplate,
        compilation,
        this.specialLabelMode,
      ),
      count: rows.length,
    };
  }

  private templateIssueMessages(): string[] {
    if (this.state.format !== "text") return [];
    return compileLibraryTextExportTemplate(this.state.textTemplate, this.specialLabelMode)
      .issues.map(libraryTextTemplateIssueMessage);
  }

  private syncView(): void {
    this.refreshModes();
    if (this.activeKind !== "library") {
      void this.renderPresentation();
      return;
    }
    const issues = this.templateIssueMessages();
    this.optionsView?.update(this.state.format, this.state.scope, this.state.textTemplate, issues);
    this.previewView?.update(this.state.format, this.output());
    const usesRanking = this.state.format === "text"
      && compileLibraryTextExportTemplate(this.state.textTemplate, this.specialLabelMode).variables.has("ranking");
    const disabled = (this.state.format === "text" && issues.length > 0)
      || (usesRanking && (!this.rankingLoaded || this.rankingError != null));
    if (this.copyButton) this.copyButton.disabled = disabled;
    if (this.saveButton) this.saveButton.disabled = disabled;
  }

  private async copy(): Promise<void> {
    try {
      if (this.activeKind === "library") {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(this.output().content);
      } else if (this.presentation.format === "png") {
        await this.presentationService.copyPng(this.pngPages ?? []);
      } else {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(this.presentationOutput);
      }
      new Notice(libraryExportText("copied"));
    } catch (error) {
      new Notice(libraryExportText("copyFailed", { error: errorMessage(error) }));
    }
  }

  private async save(): Promise<void> {
    try {
      if (this.activeKind === "library") {
        const path = await this.service.saveToVault(this.output().content, this.state.format);
        new Notice(libraryExportText("saved", { path }));
      } else if (this.presentation.format === "png") {
        const paths = await this.presentationService.savePng(
          this.pngPages ?? [], this.presentation.kind, this.presentation.mediaType,
        );
        new Notice(libraryExportText("saved", { path: paths.join(", ") }));
      } else {
        const path = await this.presentationService.saveText(
          this.presentationOutput, this.presentation.kind, this.presentation.mediaType,
        );
        new Notice(libraryExportText("saved", { path }));
      }
    } catch (error) {
      new Notice(libraryExportText("saveFailed", { error: errorMessage(error) }));
    }
  }

  private buildView(): void {
    this.contentEl.replaceChildren();
    const intro = makeEl("p", "al-library-export-intro", libraryExportText("description"));
    Object.assign(intro.style, {
      maxWidth: "760px",
      margin: "6px 0 16px",
      color: "var(--text-muted)",
      fontSize: ".74rem",
      lineHeight: "1.55",
    });
    const modeTabs = makeEl("nav", "al-modal-type-tabs al-presentation-export-kind");
    Object.assign(modeTabs.style, {
      display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "6px", marginBottom: "14px",
    });
    for (const kind of ["library", "scoreboard", "ranking"] as const) {
      const button = makeEl("button", "al-modal-type", libraryExportText(
        kind === "library" ? "presentationLibrary"
          : kind === "scoreboard" ? "presentationScoreboard" : "presentationRanking",
      ));
      button.type = "button";
      button.dataset.exportKind = kind;
      button.addEventListener("click", () => {
        if (this.activeKind === kind) return;
        this.activeKind = kind;
        if (kind !== "library") {
          this.presentation.kind = kind;
          if (kind === "ranking" && this.presentation.mediaType === "all") this.presentation.mediaType = "anime";
        }
        this.syncView();
      });
      modeTabs.appendChild(button);
    }
    const body = makeEl("div", "al-library-export-layout");
    Object.assign(body.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "18px",
      alignItems: "stretch",
      minWidth: "0",
    });

    const initialIssues = this.templateIssueMessages();
    this.optionsView = createLibraryExportOptions(
      this.state.format,
      this.state.scope,
      this.state.textTemplate,
      initialIssues,
      this.specialLabelMode,
      {
        onFormatChange: (format) => {
          if (this.state.format === format) return;
          this.state.format = format;
          this.syncView();
        },
        onScopeChange: (scope) => {
          this.state.scope = scope;
          this.syncView();
        },
        onTemplateChange: (template) => {
          if (this.state.textTemplate === template) return;
          this.state.textTemplate = template;
          this.syncView();
        },
      },
    );
    this.previewView = createLibraryExportPreview(this.state.format, this.output());
    Object.assign(this.optionsView.element.style, { flex: "1 1 300px", minWidth: "0" });
    Object.assign(this.previewView.element.style, { flex: "2 1 440px", minWidth: "0" });
    body.append(this.optionsView.element, this.previewView.element);
    this.libraryControls = this.optionsView.element;
    this.libraryPreview = this.previewView.element;
    this.buildPresentationSurface(body);

    const actions = makeEl("div", "al-modal-actions al-library-export-actions");
    Object.assign(actions.style, {
      marginTop: "14px",
      paddingTop: "14px",
      borderTop: "1px solid var(--background-modifier-border)",
    });
    const destination = makeEl("span", "al-library-export-save-location", libraryExportText("saveLocation", {
      path: `${this.service.exportFolderPath()}/`,
    }));
    Object.assign(destination.style, {
      flex: "1 1 220px",
      minWidth: "0",
      color: "var(--text-faint)",
      fontSize: ".64rem",
      overflowWrap: "anywhere",
    });
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const copy = makeEl("button", "al-secondary-button", libraryExportText("copy"));
    copy.type = "button";
    copy.addEventListener("click", () => { void this.copy(); });
    const save = makeEl("button", "mod-cta", libraryExportText("save"));
    save.type = "button";
    save.addEventListener("click", () => { void this.save(); });
    this.copyButton = copy;
    this.saveButton = save;
    actions.append(destination, cancel, copy, save);

    this.contentEl.append(modeTabs, intro, body, actions);
    this.syncView();
  }


  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }

  private buildPresentationSurface(body: HTMLElement): void {
    const controls = makeEl("section", "al-presentation-export-options");
    const preview = makeEl("section", "al-presentation-export-preview");
    for (const el of [controls, preview]) {
      Object.assign(el.style, {
        flex: el === controls ? "1 1 300px" : "2 1 440px",
        minWidth: "0", padding: "15px", borderRadius: "12px",
        border: "1px solid var(--background-modifier-border)",
        background: "var(--background-secondary)", boxSizing: "border-box",
      });
    }
    const field = (name: string, values: readonly [string, string][], change: (v: string) => void): HTMLSelectElement => {
      const label = makeEl("label", "al-form-field");
      label.appendChild(makeEl("span", "al-form-label", name));
      const select = makeEl("select");
      select.style.width = "100%";
      select.style.minHeight = "38px";
      for (const [value, text] of values) {
        const option = makeEl("option", "", text);
        option.value = value;
        select.appendChild(option);
      }
      select.addEventListener("change", () => change(select.value));
      label.appendChild(select);
      controls.appendChild(label);
      return select;
    };
    const format = field(libraryExportText("format"), [
      ["text", libraryExportText("text")], ["png", libraryExportText("presentationPng")],
    ], value => { this.presentation.format = value as "text" | "png"; this.syncView(); });
    const type = field(libraryExportText("mediaType"), [
      ["all", libraryExportText("presentationAll")],
      ["anime", "Anime"], ["manga", "Manga"], ["novel", "Novel"],
    ], value => {
      this.presentation.mediaType = value as PresentationMediaType;
      this.syncView();
    });
    const theme = field(libraryExportText("presentationTheme"), [
      ["light", libraryExportText("presentationThemeLight")],
      ["dark", libraryExportText("presentationThemeDark")],
    ], value => { this.presentation.theme = value as PresentationTheme; this.syncView(); });
    const top = field(libraryExportText("presentationTop"), [
      ["0", libraryExportText("presentationAll")],
      ["10", "Top 10"], ["20", "Top 20"], ["50", "Top 50"],
    ], value => { this.presentation.top = Number(value) || null; this.syncView(); });
    const unratedLabel = makeEl("label", "al-presentation-export-unrated");
    const unrated = makeEl("input");
    unrated.type = "checkbox";
    unrated.checked = this.presentation.includeUnrated;
    unrated.addEventListener("change", () => {
      this.presentation.includeUnrated = unrated.checked;
      this.syncView();
    });
    unratedLabel.append(unrated, makeEl("span", "", libraryExportText("presentationUnrated")));
    controls.append(unratedLabel);
    Object.assign(controls.style, { display: "flex", flexDirection: "column", gap: "14px" });
    this.presentationControls = controls;
    this.presentationPreview = preview;
    const heading = makeEl("strong", "", libraryExportText("preview"));
    const note = makeEl("p", "", "");
    const output = makeEl("textarea", "al-library-export-preview");
    output.readOnly = true;
    output.spellcheck = false;
    Object.assign(output.style, {
      display: "block", boxSizing: "border-box", width: "100%", resize: "vertical",
      minHeight: "360px", color: "var(--text-normal)", background: "var(--background-primary)",
    });
    const image = makeEl("img");
    image.alt = libraryExportText("preview");
    Object.assign(image.style, {
      display: "none", width: "100%", maxHeight: "48dvh", objectFit: "contain",
    });
    preview.append(heading, note, output, image);
    this.presentationText = output;
    this.presentationImage = image;
    this.presentationNote = note;
    body.append(controls, preview);
    this.presentationButtons.push(format, type, theme, top, unrated);
  }

  private refreshModes(): void {
    const isLibrary = this.activeKind === "library";
    if (this.libraryControls) this.libraryControls.style.display = isLibrary ? "flex" : "none";
    if (this.libraryPreview) this.libraryPreview.style.display = isLibrary ? "flex" : "none";
    if (this.presentationControls) this.presentationControls.style.display = isLibrary ? "none" : "flex";
    if (this.presentationPreview) this.presentationPreview.style.display = isLibrary ? "none" : "block";
    this.contentEl.querySelectorAll<HTMLButtonElement>("[data-export-kind]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.exportKind === this.activeKind);
    });
    const [format, type, theme, top, unrated] = this.presentationButtons;
    if (!(format instanceof HTMLSelectElement) || !(type instanceof HTMLSelectElement)
      || !(theme instanceof HTMLSelectElement) || !(top instanceof HTMLSelectElement)
      || !(unrated instanceof HTMLInputElement)) return;
    format.value = this.presentation.format;
    const all = type.querySelector<HTMLOptionElement>('option[value="all"]');
    if (all) all.disabled = this.presentation.kind === "ranking";
    type.value = this.presentation.mediaType;
    theme.value = this.presentation.theme;
    top.value = String(this.presentation.top ?? 0);
    unrated.checked = this.presentation.includeUnrated;
    theme.parentElement!.style.display = this.presentation.format === "png" ? "" : "none";
    top.parentElement!.style.display = this.presentation.kind === "ranking" ? "" : "none";
    unrated.parentElement!.style.display = this.presentation.kind === "scoreboard" ? "flex" : "none";
  }

  private async renderPresentation(): Promise<void> {
    const epoch = ++this.renderEpoch;
    this.pngPages = null;
    this.releasePreview();
    const note = this.presentationNote;
    const image = this.presentationImage;
    const text = this.presentationText;
    if (!note || !image || !text) return;
    if (this.copyButton) this.copyButton.disabled = true;
    if (this.saveButton) this.saveButton.disabled = true;
    image.style.display = "none";
    text.style.display = "none";
    if (!this.rankingLoaded && this.presentation.kind === "ranking") {
      note.textContent = libraryExportText("presentationLoading");
      return;
    }
    if (this.rankingError && this.presentation.kind === "ranking") {
      note.textContent = libraryExportText("presentationLoadFailed", { error: this.rankingError });
      return;
    }
    try {
      const doc: PresentationDocument = buildPresentationDocument(this.items, {
        ...this.presentation, ranking: this.ranking,
      });
      this.presentationOutput = formatPresentationText(doc);
      if (this.presentation.format === "text") {
        text.value = this.presentationOutput.length > 16000
          ? this.presentationOutput.slice(0, 16000) + "\n…" : this.presentationOutput;
        text.style.display = "block";
        note.textContent = this.presentationOutput.length > 16000
          ? libraryExportText("previewTruncated") : "";
      } else {
        note.textContent = libraryExportText("presentationLoading");
        const png = await rasterizePresentation(this.host, doc, this.presentation.theme);
        if (epoch !== this.renderEpoch) return;
        this.pngPages = png.pages;
        this.previewUrl = URL.createObjectURL(png.pages[0]);
        image.src = this.previewUrl;
        image.style.display = "block";
        note.textContent = libraryExportText("presentationPages", {
          count: png.pages.length, missing: png.missingCovers,
        });
      }
      if (epoch === this.renderEpoch) {
        if (this.saveButton) this.saveButton.disabled = false;
        if (this.copyButton) this.copyButton.disabled =
          this.presentation.format === "png" && (this.pngPages?.length ?? 0) > 1;
      }
    } catch (error) {
      if (epoch === this.renderEpoch) note.textContent = errorMessage(error);
    } finally {
      // The generation token makes stale async output harmless after tab changes.
    }
  }

  onClose(): void {
    this.renderEpoch += 1;
    this.releasePreview();
    this.optionsView = null;
    this.previewView = null;
    this.copyButton = null;
    this.saveButton = null;
    this.libraryControls = null;
    this.libraryPreview = null;
    this.presentationControls = null;
    this.presentationPreview = null;
    this.presentationText = null;
    this.presentationImage = null;
    this.presentationNote = null;
    this.presentationButtons.length = 0;
    this.pngPages = null;
    this.contentEl.replaceChildren();
  }
}

import { AnimeListModal } from "./animelist-modal";
import { MediaModalNavigation } from "./media-modal-navigation";
import { Notice, TFile } from "obsidian";
import type { ExternalMediaResult, MediaNoteForm, MediaType } from "../types";
import { manualMediaResult, type MediaCoverAssetInput } from "../domain/manual-media";
import { manualMediaText } from "../features/manual-media/text";
import { normalizeUserTags } from "../domain/user-tags";
import { persistedMediaTags } from "../domain/media-classification";
import { normalizeGenre } from "../domain/media-metadata";
import { providerTagDisplayLabels } from "../i18n/provider-tag-localization";
import { compatibleGenres, compatibleSourceGenres } from "../data/media-frontmatter-compat";
import { mediaFormatLabel, mediaProviderLabel, uiText } from "../ui-text";
import type { AnimeListUiHost } from "./plugin-host";
import type { MediaFormContext } from "./media-form-contracts";
import { renderMediaClassificationFields, renderStoredMediaClassificationFields } from "./media-classification-fields";
import { createLabeledField, createMediaEditorFields, createMediaFormContext, createSelect, createTextInput, mediaFormValues } from "./media-form-controls";
import { MEDIA_UI_LABELS, appendIconLabel, errorMessage, formValue, makeEl } from "./ui-helpers";
import { transitionSurface } from "./layout-motion";
import { bindImageFallback } from "./image-fallback";
import { createMediaCoverPicker, type MediaCoverPicker } from "./media-cover-picker";
import { createMediaEditorIdentity, createMediaEditorSectionHeading, updateMediaEditorIdentityTitle } from "./media-editor-layout";
import { createFilePickerControl, createUiAction } from "./ui-primitives";


function libraryTagOptions(plugin: AnimeListUiHost, extra: unknown = []): string[] {
  return normalizeUserTags([
    ...plugin.settings.tagCatalog,
    ...plugin.collectMediaItems().flatMap((item) => [
      ...item.genres,
      ...(item.userTags ?? []),
    ]),
    ...normalizeUserTags(extra),
  ]);
}

interface ManualMediaFormState {
  values?: Partial<MediaNoteForm> & { title?: string; genres?: string[]; };
  originalTitle?: string;
  format?: string;
  year?: string;
  templatePath?: string;
}

export class AddMediaModal extends AnimeListModal {
  readonly plugin: AnimeListUiHost;
  mediaType: MediaType;
  query = "";
  results: ExternalMediaResult[] = [];
  warnings: string[] = [];
  hasMore = false;
  private readonly navigation = new MediaModalNavigation();
  private manualCoverFile: File | null = null;
  private manualCoverPreviewUrl: string | null = null;
  private activeFormContext: MediaFormContext<AnimeListUiHost> | null = null;

  constructor(plugin: AnimeListUiHost, initialType: MediaType = "anime") {
    super(plugin.app);
    this.plugin = plugin;
    this.mediaType = initialType;
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal");
    this.renderSearch();
  }

  onClose(): void {
    this.navigation.enter();
    this.disposeActiveForm();
    if (this.manualCoverPreviewUrl) URL.revokeObjectURL(this.manualCoverPreviewUrl);
    this.manualCoverPreviewUrl = null;
    this.manualCoverFile = null;
  }

  private activateForm(context: MediaFormContext<AnimeListUiHost>): void {
    this.disposeActiveForm();
    this.activeFormContext = context;
  }

  private disposeActiveForm(): void {
    this.activeFormContext?.dispose();
    this.activeFormContext = null;
  }

  renderSearch(): void {
    this.navigation.enter();
    this.disposeActiveForm();
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const headingCopy = makeEl("div");
    headingCopy.append(
      makeEl("div", "al-kicker", uiText("add.kicker")),
      makeEl("h2", "", uiText("add.title")),
      makeEl("p", "", uiText("add.description")),
    );
    heading.appendChild(headingCopy);
    this.contentEl.appendChild(heading);

    const typeTabs = createDiv();
    typeTabs.className = "al-modal-type-tabs al-collect-type-tabs";
    const mediaTypes: Array<[MediaType, string]> = [["anime", MEDIA_UI_LABELS.type.anime], ["manga", MEDIA_UI_LABELS.type.manga], ["novel", MEDIA_UI_LABELS.type.novel]];
    mediaTypes.forEach(([value, text]) => {
      const button = createEl("button");
      button.type = "button";
      button.className = `al-modal-type${this.mediaType === value ? " is-active" : ""}`;
      button.textContent = text;
      button.addEventListener("click", () => {
        this.mediaType = value;
        this.results = [];
        this.warnings = [];
        this.hasMore = false;
        this.renderSearch();
      });
      typeTabs.appendChild(button);
    });
    const manual = createEl("button");
    manual.type = "button";
    manual.className = "al-modal-type";
    manual.textContent = manualMediaText("tab");
    manual.addEventListener("click", () => { void this.renderManualDetails(this.mediaType); });
    typeTabs.appendChild(manual);
    this.contentEl.appendChild(typeTabs);

    const searchRow = createDiv();
    searchRow.className = "al-modal-search-row";
    const input = createTextInput("search", this.query);
    input.placeholder = this.mediaType === "anime" ? uiText("add.placeholderAnime") : this.mediaType === "manga" ? uiText("add.placeholderManga") : uiText("add.placeholderNovel");
    const button = createEl("button");
    button.type = "button";
    button.className = "mod-cta";
    button.textContent = uiText("action.search");
    const runSearch = (): void => {
      this.query = input.value.trim();
      if (!this.query) { new Notice(uiText("notice.searchQueryRequired")); return; }
      void this.search(button);
    };
    button.addEventListener("click", runSearch);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
    searchRow.append(input, button);
    this.contentEl.appendChild(searchRow);

    const hint = createEl("p");
    hint.className = "al-modal-hint";
    hint.textContent = this.mediaType === "novel" ? uiText("add.hintNovel") : uiText("add.hintMedia");
    this.contentEl.appendChild(hint);

    if (this.warnings.length) {
      const warning = createDiv();
      warning.className = "al-modal-warning";
      warning.textContent = uiText("add.warning", { warnings: this.warnings.join("；") });
      this.contentEl.appendChild(warning);
    }

    const resultsEl = createDiv();
    resultsEl.className = "al-search-results";
    if (!this.results.length && this.query && !this.hasMore) {
      const empty = createDiv();
      empty.className = "al-search-empty";
      empty.textContent = uiText("add.emptyResult");
      resultsEl.appendChild(empty);
    }
    this.results.forEach((result) => resultsEl.appendChild(this.createResultRow(result)));
    this.contentEl.appendChild(resultsEl);
    this.plugin.afterSearchRender(this);
    window.setTimeout(() => { if (this.contentEl.contains(input)) input.focus(); }, 0);
  }

  async search(button: HTMLButtonElement): Promise<void> {
    const generation = this.navigation.enter();
    const mediaType = this.mediaType;
    const query = this.query;
    button.disabled = true;
    button.textContent = uiText("add.searching");
    this.results = [];
    this.warnings = [];
    this.hasMore = false;
    this.contentEl.querySelector(".al-search-pagination")?.remove();
    const current = this.contentEl.querySelector<HTMLElement>(".al-search-results");
    if (current) current.replaceChildren(makeEl("p", "al-modal-hint", uiText("add.searching")));

    // Show first matching provider immediately, without waiting for fallback
    // aliases or a rate-limited second metadata service. Do not replace the
    // search form: this preserves keyboard focus and current input text.
    const onProgress = (results: ExternalMediaResult[]): void => {
      if (!this.navigation.isCurrent(generation) || mediaType !== this.mediaType || query !== this.query) return;
      this.results = results;
      const panel = this.contentEl.querySelector<HTMLElement>(".al-search-results");
      if (panel) panel.replaceChildren(...results.map(result => this.createResultRow(result)));
    };
    try {
      const response = await this.plugin.searchExternal(mediaType, query, onProgress);
      if (!this.navigation.isCurrent(generation) || mediaType !== this.mediaType || query !== this.query) return;
      this.results = response.results;
      this.warnings = response.warnings;
      this.hasMore = response.hasMore ?? this.results.length > 0;
      if (!this.results.length) new Notice(uiText("notice.searchNoResults"));
    } catch (error) {
      if (!this.navigation.isCurrent(generation) || mediaType !== this.mediaType || query !== this.query) return;
      console.error("AnimeList external search failed", error);
      this.results = [];
      this.hasMore = false;
      this.warnings = [errorMessage(error)];
      new Notice(uiText("notice.searchUnavailable"));
    }
    this.renderSearch();
  }

  createResultRow(result: ExternalMediaResult): HTMLElement {
    const row = createEl("button");
    row.type = "button";
    row.className = "al-search-result";
    if (result.coverUrl) {
      const image = createEl("img");
      image.alt = "";
      image.loading = "lazy";
      bindImageFallback(image, () => makeEl("div", "al-search-result-placeholder", uiText("add.noCover")));
      row.appendChild(image);
      image.src = result.coverUrl;
    } else {
      row.appendChild(makeEl("div", "al-search-result-placeholder", uiText("add.noCover")));
    }
    const body = createDiv();
    body.className = "al-search-result-body";
    const title = createEl("strong");
    title.textContent = result.title;
    const original = createSpan();
    original.textContent = result.originalTitle || result.romajiTitle || "";
    const meta = createSpan();
    meta.textContent = [mediaProviderLabel(result.provider), result.year || uiText("add.unknownYear"), mediaFormatLabel(result.format)].filter(Boolean).join(" · ");
    body.append(title, original, meta);
    const use = createSpan();
    use.className = "al-search-result-use";
    use.textContent = uiText("action.select");
    row.append(body, use);
    row.addEventListener("click", () => void this.renderDetails(result));
    return row;
  }

  private async renderManualDetails(mediaType: MediaType, state: ManualMediaFormState = {}): Promise<void> {
    const generation = this.navigation.enter();
    this.disposeActiveForm();
    this.mediaType = mediaType;
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    const back = createEl("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = uiText("action.back");
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const heading = makeEl("div", "al-modal-heading");
    const copy = makeEl("div");
    copy.append(
      makeEl("div", "al-kicker", manualMediaText("tab")),
      makeEl("h2", "", manualMediaText("title")),
      makeEl("p", "", manualMediaText("description")),
    );
    heading.appendChild(copy);
    this.contentEl.appendChild(heading);

    const typeFieldHost = makeEl("div", "al-media-form al-manual-media-meta");
    const type = createLabeledField(typeFieldHost, manualMediaText("mediaType"), createSelect([
      ["anime", MEDIA_UI_LABELS.type.anime],
      ["manga", MEDIA_UI_LABELS.type.manga],
      ["novel", MEDIA_UI_LABELS.type.novel],
    ], mediaType));
    const originalTitle = createLabeledField(
      typeFieldHost,
      manualMediaText("originalTitle"),
      createTextInput("text", state.originalTitle ?? ""),
    );
    const format = createLabeledField(
      typeFieldHost,
      manualMediaText("format"),
      createTextInput("text", state.format ?? ""),
    );
    const year = createLabeledField(
      typeFieldHost,
      manualMediaText("year"),
      createTextInput("text", state.year ?? ""),
    );
    const coverPicker = createFilePickerControl(uiText("edit.coverChoose"), "image/jpeg,image/png,image/webp,image/avif");
    const coverInput = coverPicker.input;
    const coverField = makeEl("div", "al-form-field al-manual-cover-input");
    coverField.append(
      makeEl("span", "al-form-label", manualMediaText("cover")),
      coverPicker.element,
      makeEl("small", "al-form-hint", manualMediaText("coverHint")),
    );
    typeFieldHost.appendChild(coverField);
    const coverPreview = makeEl("div", "al-manual-cover-preview");
    const renderCoverPreview = (): void => {
      coverPreview.replaceChildren();
      if (this.manualCoverPreviewUrl) URL.revokeObjectURL(this.manualCoverPreviewUrl);
      this.manualCoverPreviewUrl = null;
      if (!this.manualCoverFile) {
        coverPreview.appendChild(makeEl("span", "", manualMediaText("noCover")));
        return;
      }
      this.manualCoverPreviewUrl = URL.createObjectURL(this.manualCoverFile);
      const image = makeEl("img");
      image.alt = "";
      bindImageFallback(image, () => makeEl("span", "al-manual-cover-preview-missing", manualMediaText("noCover")));
      coverPreview.append(image, makeEl("span", "", this.manualCoverFile.name));
      image.src = this.manualCoverPreviewUrl;
    };
    coverInput.addEventListener("change", () => {
      this.manualCoverFile = coverInput.files?.[0] ?? null;
      renderCoverPreview();
    });
    renderCoverPreview();
    typeFieldHost.appendChild(coverPreview);
    this.contentEl.appendChild(typeFieldHost);

    const templates = await this.plugin.getTemplates(mediaType).catch((error: unknown) => {
      if (this.navigation.isCurrent(generation)) {
        console.error("AnimeList manual template loading failed", error);
        new Notice(uiText("notice.searchUnavailable"));
      }
      return null;
    });
    if (!templates || !this.navigation.isCurrent(generation) || !this.contentEl.isConnected) return;
    this.contentEl.appendChild(createMediaEditorSectionHeading(uiText("edit.collectionData")));
    const form = createDiv();
    form.className = "al-media-form";
    const values = state.values ?? {};
    const templateOptions: Array<[string, string]> = templates.length
      ? templates.map((template): [string, string] => [template.path, template.name])
      : [["", uiText("add.noTemplate")]];
    const fields = createMediaEditorFields({
      parent: form,
      mediaType,
      values: {
        title: values.title ?? "",
        status: values.status ?? "planned",
        releaseStatus: values.releaseStatus ?? "unknown",
        score: values.score ?? "",
        startedAt: values.startedAt ?? "",
        completedAt: values.completedAt ?? "",
        progress: values.progress ?? 0,
        total: values.total ?? "",
        unit: values.unit ?? (mediaType === "anime" ? "episode" : mediaType === "manga" ? "chapter" : "volume"),
        genres: values.genres ?? [],
        userTags: values.userTags ?? [],
        favorite: values.favorite === true,
      },
      templateOptions,
      selectedTemplate: state.templatePath,
      tagOptions: libraryTagOptions(this.plugin),
    });
    this.contentEl.appendChild(form);

    const result = manualMediaResult({ title: String(values.title ?? ""), mediaType });
    const context = createMediaFormContext({
      mode: "create",
      plugin: this.plugin,
      modalEl: this.modalEl,
      formEl: form,
      mediaType,
      result,
      file: null,
      frontmatter: {},
      fields,
    });
    this.activateForm(context);
    this.plugin.configureMediaForm(context);

    type.addEventListener("change", () => {
      const nextType = type.value === "manga" || type.value === "novel" ? type.value : "anime";
      const current = mediaFormValues(context);
      void this.renderManualDetails(nextType, {
        values: current,
        originalTitle: originalTitle.value,
        format: format.value,
        year: year.value,
        templatePath: fields.template?.value ?? "",
      });
    });

    const actions = createDiv();
    actions.className = "al-modal-actions";
    const createButton = createUiAction(uiText("action.collect"), "primary");
    createButton.addEventListener("click", () => {
      void (async () => {
        createButton.disabled = true;
        createButton.textContent = uiText("add.processing");
        try {
          const submitContext = { ...context, form: mediaFormValues(context) };
          await this.plugin.prepareMediaSubmit(submitContext);
          const manualResult = manualMediaResult({
            title: submitContext.form.title,
            mediaType,
            originalTitle: originalTitle.value,
            format: format.value,
            year: year.value,
            releaseStatus: submitContext.form.releaseStatus,
          });
          const coverAsset: MediaCoverAssetInput | null = this.manualCoverFile
            ? { name: this.manualCoverFile.name, contentType: this.manualCoverFile.type, data: await this.manualCoverFile.arrayBuffer() }
            : null;
          const file = await this.plugin.createMediaNote(manualResult, submitContext.form, coverAsset);
          this.close();
          new Notice(uiText("notice.collected", { title: submitContext.form.title }));
          await this.plugin.app.workspace.openLinkText(file.path, "", false);
        } catch (error) {
          console.error("AnimeList manual create note failed", error);
          new Notice(uiText("notice.createFailed", { error: errorMessage(error) }));
          createButton.disabled = false;
          createButton.textContent = uiText("action.collect");
        }
      })();
    });
    actions.appendChild(createButton);
    this.contentEl.appendChild(actions);
  }

  async renderDetails(result: ExternalMediaResult): Promise<void> {
    const generation = this.navigation.enter();
    this.disposeActiveForm();
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    const back = createEl("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = uiText("action.back");
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const identity = createMediaEditorIdentity({
      title: result.title,
      originalTitle: result.originalTitle || result.romajiTitle || "",
      provider: mediaProviderLabel(result.provider),
      coverUrl: result.coverUrl,
      coverAlt: uiText("library.coverAlt", { title: result.title }),
      missingCoverText: uiText("add.noCover"),
    });
    this.contentEl.appendChild(identity);

    const metadataLoading = makeEl("p", "al-modal-hint", uiText("add.metadataLoading"));
    this.contentEl.appendChild(metadataLoading);
    let details: Awaited<ReturnType<AnimeListUiHost["enrichExternalMedia"]>>;
    let templates: Awaited<ReturnType<AnimeListUiHost["getTemplates"]>>;
    try {
      [templates, details] = await Promise.all([
        this.plugin.getTemplates(result.mediaType),
        this.plugin.enrichExternalMedia(result),
      ]);
    } catch (error) {
      if (this.navigation.isCurrent(generation)) {
        console.error("AnimeList selected media metadata failed", error);
        metadataLoading.textContent = uiText("notice.searchUnavailable");
      }
      return;
    }
    if (!this.navigation.isCurrent(generation) || !this.contentEl.isConnected) return;
    const enrichedResult = details;
    metadataLoading.remove();
    updateMediaEditorIdentityTitle(identity, enrichedResult.title, uiText("library.coverAlt", { title: enrichedResult.title }));
    const metadataHost = createDiv();
    metadataHost.className = "al-edit-metadata-host";
    renderMediaClassificationFields(metadataHost, enrichedResult);
    this.contentEl.appendChild(metadataHost);

    this.contentEl.appendChild(createMediaEditorSectionHeading(uiText("edit.collectionData")));
    const form = createDiv();
    form.className = "al-media-form";
    const templateOptions: Array<[string, string]> = templates.length
      ? templates.map((template): [string, string] => [template.path, template.name])
      : [["", uiText("add.noTemplate")]];
    const apiTagValues = [
      ...enrichedResult.genres,
      ...enrichedResult.rawGenres,
      ...persistedMediaTags(enrichedResult.classification),
    ];
    const fields = createMediaEditorFields({
      parent: form,
      mediaType: enrichedResult.mediaType,
      values: {
        title: enrichedResult.title,
        status: "planned",
        releaseStatus: enrichedResult.releaseStatus,
        score: "",
        startedAt: "",
        completedAt: "",
        progress: 0,
        total: enrichedResult.total || "",
        unit: enrichedResult.unit,
        genres: enrichedResult.genres,
        favorite: false,
      },
      templateOptions,
      tagOptions: libraryTagOptions(this.plugin, persistedMediaTags(enrichedResult.classification)),
      tagDisplayLabels: providerTagDisplayLabels(apiTagValues),
    });
    this.contentEl.appendChild(form);

    if (enrichedResult.titleSuggestion) {
      const suggestion = enrichedResult.titleSuggestion;
      const proposal = createDiv();
      proposal.className = "al-source-note";
      proposal.appendChild(makeEl("p", "al-modal-hint",
        "Possible translated title from " + suggestion.provider
        + " (name/year match; identity not verified): " + suggestion.title));
      const use = createEl("button");
      use.type = "button";
      use.textContent = "Use suggested title";
      use.addEventListener("click", () => {
        fields.title.value = suggestion.title;
        fields.title.dispatchEvent(new Event("input", { bubbles: true }));
      });
      proposal.appendChild(use);
      this.contentEl.appendChild(proposal);
    }

    const context = createMediaFormContext({
      mode: "create",
      plugin: this.plugin,
      modalEl: this.modalEl,
      formEl: form,
      metadataHostEl: metadataHost,
      mediaType: enrichedResult.mediaType,
      result: enrichedResult,
      file: null,
      frontmatter: {},
      fields,
    });
    this.activateForm(context);
    this.plugin.configureMediaForm(context);

    const sourceNote = createDiv();
    sourceNote.className = "al-source-note";
    sourceNote.textContent = enrichedResult.mediaType === "novel" ? uiText("add.sourceNovel") : uiText("add.sourceMedia");
    this.contentEl.appendChild(sourceNote);

    const actions = createDiv();
    actions.className = "al-modal-actions";
    const createButton = createUiAction(uiText("action.collect"), "primary");
    createButton.addEventListener("click", () => {
      void (async () => {
      createButton.disabled = true;
      createButton.textContent = uiText("add.processing");
      try {
        const submitContext = { ...context, form: mediaFormValues(context) };
        await this.plugin.prepareMediaSubmit(submitContext);
        const file = await this.plugin.createMediaNote(enrichedResult, submitContext.form);
        this.close();
        new Notice(uiText("notice.collected", { title: submitContext.form.title }));
        await this.plugin.app.workspace.openLinkText(file.path, "", false);
      } catch (error) {
        console.error("AnimeList create note failed", error);
        new Notice(uiText("notice.createFailed", { error: errorMessage(error) }));
        createButton.disabled = false;
        createButton.textContent = uiText("action.collect");
      }
      })();
    });
    actions.appendChild(createButton);
    this.contentEl.appendChild(actions);
  }
}

export class ConfirmDeleteModal extends AnimeListModal {
  constructor(
    private readonly plugin: AnimeListUiHost,
    private readonly file: TFile,
    private readonly onDeleted: (() => void | Promise<void>) | null = null,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-confirm-modal", "al-dialog-compact");
    const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const title = makeEl("h2", "", uiText("delete.title"));
    const description = makeEl("p", "", uiText("delete.description", { title: formValue(fm.title, this.file.basename) }));
    const actions = makeEl("div", "al-modal-actions al-confirm-actions");
    const cancel = createUiAction(uiText("action.cancel"));
    cancel.addEventListener("click", () => this.close());
    const remove = createUiAction(uiText("action.delete"), "danger");
    remove.addEventListener("click", () => {
      void (async () => {
      remove.disabled = true;
      try {
        await this.plugin.deleteMediaFile(this.file);
        this.close();
        if (this.onDeleted) await this.onDeleted();
        new Notice(uiText("notice.deleted"));
      } catch (error) {
        console.error("AnimeList delete failed", error);
        new Notice(uiText("notice.deleteFailed", { error: errorMessage(error) }));
        remove.disabled = false;
      }
      })();
    });
    actions.append(cancel, remove);
    this.contentEl.append(title, description, actions);
  }
}

export class EditMediaModal extends AnimeListModal {
  private activeFormContext: MediaFormContext<AnimeListUiHost> | null = null;
  private coverPicker: MediaCoverPicker | null = null;

  constructor(
    private readonly plugin: AnimeListUiHost,
    private readonly file: TFile,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-edit-modal");
    this.render();
  }

  onClose(): void {
    this.activeFormContext?.dispose();
    this.activeFormContext = null;
    this.coverPicker?.dispose();
    this.coverPicker = null;
  }

  private render(): void {
    this.activeFormContext?.dispose();
    this.activeFormContext = null;
    this.coverPicker?.dispose();
    this.coverPicker = null;
    const frontmatter = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    transitionSurface(this.contentEl, () => this.contentEl.replaceChildren());
    const mediaType: MediaType = frontmatter.media_type === "manga" || frontmatter.media_type === "novel"
      ? frontmatter.media_type
      : "anime";
    const title = String(formValue(frontmatter.title, this.file.basename));
    const coverPath = typeof frontmatter.cover === "string" ? frontmatter.cover : "";
    const fallbackPath = typeof frontmatter.cover_remote === "string" ? frontmatter.cover_remote : "";
    this.contentEl.appendChild(createMediaEditorIdentity({
      title,
      originalTitle: typeof frontmatter.title_original === "string" ? frontmatter.title_original : "",
      provider: typeof frontmatter.source_provider === "string" ? mediaProviderLabel(frontmatter.source_provider) : "",
      coverUrl: this.plugin.resolveMediaCoverPath(coverPath, this.file.path)
        || this.plugin.resolveMediaCoverPath(fallbackPath, this.file.path),
      coverAlt: uiText("library.coverAlt", { title }),
      missingCoverText: uiText("add.noCover"),
    }));
    this.contentEl.appendChild(makeEl("p", "al-modal-hint al-editor-description", uiText("edit.description")));

    const metadataHost = createDiv();
    metadataHost.className = "al-edit-metadata-host";
    renderStoredMediaClassificationFields(metadataHost, frontmatter, mediaType, true);
    this.contentEl.appendChild(metadataHost);

    this.coverPicker = createMediaCoverPicker(this.plugin, this.file, frontmatter);
    this.contentEl.appendChild(this.coverPicker.element);

    this.contentEl.appendChild(createMediaEditorSectionHeading(uiText("edit.collectionData")));

    const form = createDiv();
    form.className = "al-media-form al-edit-media-form";
    const sourceGenres = compatibleSourceGenres(frontmatter);
    const apiTagValues = [
      ...normalizeUserTags(frontmatter.media_tags),
      ...sourceGenres,
      ...sourceGenres.map((value) => normalizeGenre(value)).filter(Boolean),
    ];
    const fields = createMediaEditorFields({
      parent: form,
      mediaType,
      values: {
        title: formValue(frontmatter.title, this.file.basename),
        status: frontmatter.status,
        releaseStatus: frontmatter.release_status,
        score: frontmatter.score,
        startedAt: frontmatter.started_at,
        completedAt: frontmatter.completed_at,
        progress: formValue(frontmatter.progress, 0),
        total: frontmatter.progress_total,
        unit: frontmatter.progress_unit,
        genres: compatibleGenres(frontmatter),
        favorite: frontmatter.favorite === true,
      },
      selectedUnit: typeof frontmatter.progress_unit === "string"
        ? frontmatter.progress_unit
        : undefined,
      tagOptions: libraryTagOptions(this.plugin, frontmatter.media_tags),
      tagDisplayLabels: providerTagDisplayLabels(apiTagValues),
    });
    this.contentEl.appendChild(form);

    const context = createMediaFormContext({
      mode: "edit",
      plugin: this.plugin,
      modalEl: this.modalEl,
      formEl: form,
      metadataHostEl: metadataHost,
      mediaType,
      result: null,
      file: this.file,
      frontmatter,
      fields,
    });
    this.activeFormContext = context;
    this.plugin.configureMediaForm(context);

    const actions = createDiv();
    actions.className = "al-modal-actions al-edit-actions";
    const deleteButton = createUiAction("", "secondary");
    deleteButton.classList.add("al-delete-button");
    appendIconLabel(deleteButton, "trash", uiText("action.delete"));
    deleteButton.addEventListener("click", () => new ConfirmDeleteModal(this.plugin, this.file, () => this.close()).open());
    const save = createUiAction(uiText("action.save"), "primary");
    save.addEventListener("click", () => {
      void (async () => {
        save.disabled = true;
        try {
          const submitContext = { ...context, form: mediaFormValues(context) };
          await this.plugin.prepareMediaSubmit(submitContext);
          const coverAsset = await this.coverPicker?.readSelectedAsset();
          await this.plugin.updateMediaNote(this.file, mediaType, submitContext.form, coverAsset);
          this.close();
          new Notice(uiText("notice.saved"));
        } catch (error) {
          console.error("AnimeList edit failed", error);
          new Notice(uiText("notice.saveFailed", { error: errorMessage(error) }));
          save.disabled = false;
        }
      })();
    });
    actions.append(deleteButton, save);
    this.contentEl.appendChild(actions);
  }
}

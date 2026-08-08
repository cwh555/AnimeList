import { Modal, Notice, TFile } from "obsidian";
import type { ExternalMediaResult, MediaType } from "../types";
import { normalizeUserTags } from "../domain/user-tags";
import { persistedMediaTags } from "../domain/media-classification";
import { normalizeGenre } from "../domain/media-metadata";
import { providerTagDisplayLabels } from "../i18n/provider-tag-localization";
import { compatibleGenres, compatibleSourceGenres } from "../data/media-frontmatter-compat";
import { storedMediaNeedsClassificationRefresh } from "../data/stored-media-result";
import { mediaFormatLabel, mediaProviderLabel, uiText } from "../ui-text";
import type { AnimeListUiHost } from "./plugin-host";
import { renderMediaClassificationFields, renderStoredMediaClassificationFields } from "./media-classification-fields";
import { createMediaEditorFields, createMediaFormContext, createTextInput, mediaFormValues } from "./media-form-controls";
import { MEDIA_UI_LABELS, appendIconLabel, errorMessage, formValue, makeEl } from "./ui-helpers";


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

export class AddMediaModal extends Modal {
  readonly plugin: AnimeListUiHost;
  mediaType: MediaType;
  query = "";
  results: ExternalMediaResult[] = [];
  warnings: string[] = [];

  constructor(plugin: AnimeListUiHost, initialType: MediaType = "anime") {
    super(plugin.app);
    this.plugin = plugin;
    this.mediaType = initialType;
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal");
    this.renderSearch();
  }

  renderSearch(): void {
    this.contentEl.replaceChildren();
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
    typeTabs.className = "al-modal-type-tabs";
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
        this.renderSearch();
      });
      typeTabs.appendChild(button);
    });
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
    if (!this.results.length && this.query) {
      const empty = createDiv();
      empty.className = "al-search-empty";
      empty.textContent = uiText("add.emptyResult");
      resultsEl.appendChild(empty);
    }
    this.results.forEach((result) => resultsEl.appendChild(this.createResultRow(result)));
    this.contentEl.appendChild(resultsEl);
    this.plugin.afterSearchRender(this);
    window.setTimeout(() => input.focus(), 0);
  }

  async search(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = uiText("add.searching");
    try {
      const response = await this.plugin.searchExternal(this.mediaType, this.query);
      this.results = response.results;
      this.warnings = response.warnings;
      if (!this.results.length) new Notice(uiText("notice.searchNoResults"));
    } catch (error) {
      console.error("AnimeList external search failed", error);
      this.results = [];
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
      image.src = result.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      row.appendChild(image);
    } else {
      const placeholder = createDiv();
      placeholder.className = "al-search-result-placeholder";
      placeholder.textContent = uiText("add.noCover");
      row.appendChild(placeholder);
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

  async renderDetails(result: ExternalMediaResult): Promise<void> {
    this.contentEl.replaceChildren();
    const back = createEl("button");
    back.type = "button";
    back.className = "al-modal-back";
    back.textContent = uiText("action.back");
    back.addEventListener("click", () => this.renderSearch());
    this.contentEl.appendChild(back);

    const preview = createDiv();
    preview.className = "al-selected-preview";
    if (result.coverUrl) {
      const image = createEl("img");
      image.src = result.coverUrl;
      image.alt = uiText("library.coverAlt", { title: result.title });
      preview.appendChild(image);
    }
    const copy = createDiv();
    copy.append(
      makeEl("div", "al-kicker", mediaProviderLabel(result.provider)),
      makeEl("h2", "", result.title),
      makeEl("p", "", result.originalTitle || result.romajiTitle || ""),
    );
    preview.appendChild(copy);
    this.contentEl.appendChild(preview);

    const metadataLoading = makeEl("p", "al-modal-hint", uiText("add.metadataLoading"));
    this.contentEl.appendChild(metadataLoading);
    const [templates, enrichedResult] = await Promise.all([
      this.plugin.getTemplates(result.mediaType),
      this.plugin.enrichExternalMedia(result),
    ]);
    metadataLoading.remove();
    renderMediaClassificationFields(this.contentEl, enrichedResult);

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

    const context = createMediaFormContext({
      mode: "create",
      plugin: this.plugin,
      modalEl: this.modalEl,
      formEl: form,
      mediaType: enrichedResult.mediaType,
      result: enrichedResult,
      file: null,
      frontmatter: {},
      fields,
    });
    this.plugin.configureMediaForm(context);

    const sourceNote = createDiv();
    sourceNote.className = "al-source-note";
    sourceNote.textContent = enrichedResult.mediaType === "novel" ? uiText("add.sourceNovel") : uiText("add.sourceMedia");
    this.contentEl.appendChild(sourceNote);

    const actions = createDiv();
    actions.className = "al-modal-actions";
    const createButton = createEl("button");
    createButton.type = "button";
    createButton.className = "mod-cta";
    createButton.textContent = uiText("action.collect");
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

export class ConfirmDeleteModal extends Modal {
  constructor(
    private readonly plugin: AnimeListUiHost,
    private readonly file: TFile,
    private readonly onDeleted: (() => void | Promise<void>) | null = null,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-confirm-modal");
    const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const title = makeEl("h2", "", uiText("delete.title"));
    const description = makeEl("p", "", uiText("delete.description", { title: formValue(fm.title, this.file.basename) }));
    const actions = makeEl("div", "al-modal-actions al-confirm-actions");
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const remove = makeEl("button", "mod-warning", uiText("action.delete"));
    remove.type = "button";
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

export class EditMediaModal extends Modal {
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

  private render(): void {
    const frontmatter = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter || {};
    this.contentEl.replaceChildren();
    const heading = createDiv();
    heading.className = "al-modal-heading";
    const titleHeading = createEl("h2");
    titleHeading.textContent = uiText("edit.title", { title: formValue(frontmatter.title, this.file.basename) });
    const description = createEl("p");
    description.textContent = uiText("edit.description");
    heading.append(titleHeading, description);
    this.contentEl.appendChild(heading);

    const mediaType: MediaType = frontmatter.media_type === "manga" || frontmatter.media_type === "novel"
      ? frontmatter.media_type
      : "anime";

    const metadataHost = createDiv();
    metadataHost.className = "al-edit-metadata-host";
    renderStoredMediaClassificationFields(metadataHost, frontmatter, mediaType, true);
    this.contentEl.appendChild(metadataHost);

    const needsMetadataRefresh = storedMediaNeedsClassificationRefresh(frontmatter, mediaType);
    if (needsMetadataRefresh) {
      const loading = makeEl("small", "al-metadata-refresh-note", uiText("edit.metadataRefreshing"));
      metadataHost.appendChild(loading);
      void this.plugin.enrichStoredMedia(frontmatter, mediaType).then((enriched) => {
        if (!this.contentEl.isConnected) return;
        metadataHost.replaceChildren();
        renderMediaClassificationFields(metadataHost, enriched, true);
      }).catch((error) => {
        console.warn("AnimeList edit metadata refresh failed", error);
        loading.textContent = uiText("edit.metadataRefreshUnavailable");
      });
    }

    const formHeading = createEl("h3");
    formHeading.className = "al-form-section-heading al-edit-form-heading";
    formHeading.textContent = uiText("edit.collectionData");
    this.contentEl.appendChild(formHeading);

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
      mediaType,
      result: null,
      file: this.file,
      frontmatter,
      fields,
    });
    this.plugin.configureMediaForm(context);

    const actions = createDiv();
    actions.className = "al-modal-actions al-edit-actions";
    const deleteButton = createEl("button");
    deleteButton.type = "button";
    deleteButton.className = "al-delete-button";
    appendIconLabel(deleteButton, "trash", uiText("action.delete"));
    deleteButton.addEventListener("click", () => new ConfirmDeleteModal(this.plugin, this.file, () => this.close()).open());
    const save = createEl("button");
    save.type = "button";
    save.className = "mod-cta";
    save.textContent = uiText("action.save");
    save.addEventListener("click", () => {
      void (async () => {
        save.disabled = true;
        try {
          const submitContext = { ...context, form: mediaFormValues(context) };
          await this.plugin.prepareMediaSubmit(submitContext);
          await this.plugin.updateMediaNote(this.file, mediaType, submitContext.form);
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

import { Modal, TFile, type Plugin } from "obsidian";
import { fetchAniListClassifications, mergeAniListClassifications } from "./anilist-classification";
import { classificationText } from "./classification-feature-text";
import {
  automaticClassificationForResult,
  isLegacyGenreFieldLabel,
  storedClassificationSelection,
  writeClassificationSelection,
} from "./classification-compatibility";
import {
  classificationSuggestions,
  createClassificationSelection,
  normalizeClassificationValues,
  type ClassificationSelection,
} from "./media-classification";
import type { ExternalMediaResult, MediaItem, MediaNoteForm, MediaType } from "./types";

const PATCH_MARKER = Symbol.for("animelist.media-classification");
const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const pendingEditClassification = new Map<string, ClassificationSelection>();
const pendingCreateClassification = new WeakMap<ExternalMediaResult, ClassificationSelection>();
const enrichedAniListResults = new WeakSet<ExternalMediaResult>();

interface RuntimePlugin extends Plugin {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
  openAddModal(initialType?: MediaType): void;
  openEditModal(path: string): void;
  collectMediaItems(source?: string): MediaItem[];
}

interface ClassificationModal extends Modal {
  renderDetails?: (result: ExternalMediaResult) => Promise<void>;
  file?: TFile;
}

export interface ClassificationMetadataItem {
  label: string;
  value: string;
}

export function classificationMetadataForResult(result: ExternalMediaResult): ClassificationMetadataItem[] {
  const output: ClassificationMetadataItem[] = [];
  if (result.year !== "" && result.year != null) {
    output.push({ label: classificationText("year"), value: String(result.year) });
  }
  const people = result.people.map((value) => value.trim()).filter(Boolean);
  if (people.length) {
    output.push({
      label: classificationText(result.mediaType === "anime" ? "studios" : "creators"),
      value: people.join("、"),
    });
  }
  return output;
}

export function applyClassificationFrontmatter(
  frontmatter: Record<string, unknown>,
  selection: ClassificationSelection,
): void {
  writeClassificationSelection(frontmatter, selection);
}

function findLegacyGenreField(form: Element): HTMLElement | null {
  return Array.from(form.querySelectorAll<HTMLElement>(".al-form-field")).find((field) => {
    const label = field.querySelector(".al-form-label")?.textContent?.trim() ?? "";
    return isLegacyGenreFieldLabel(label);
  }) ?? null;
}

function createPicker(
  kind: "genre" | "tag",
  initialValues: unknown,
  onChange: (values: string[]) => void,
): HTMLElement {
  let values = normalizeClassificationValues(initialValues, kind);
  const suggestions = classificationSuggestions(kind);
  const root = createEl("section", { cls: "al-classification-field" });
  const header = root.createDiv({ cls: "al-classification-header" });
  header.setText(classificationText(kind === "genre" ? "genres" : "tags"));
  const chips = root.createDiv({ cls: "al-classification-chips" });
  const inputRow = root.createDiv({ cls: "al-classification-input-row" });
  const input = inputRow.createEl("input", { type: "search" });
  input.placeholder = classificationText("inputPlaceholder");
  const add = inputRow.createEl("button", { text: classificationText("add") });
  add.type = "button";
  const options = root.createDiv({ cls: "al-classification-suggestions" });

  const emit = (): void => onChange([...values]);
  const addValue = (candidate: string): void => {
    const next = normalizeClassificationValues([...values, candidate], kind);
    if (next.length === values.length) return;
    values = next;
    input.value = "";
    emit();
    render();
  };
  const removeValue = (candidate: string): void => {
    values = values.filter((value) => value !== candidate);
    emit();
    render();
  };
  const render = (): void => {
    chips.replaceChildren();
    for (const value of values) {
      const chip = chips.createEl("span", { cls: "al-classification-chip" });
      chip.append(value);
      const remove = chip.createEl("button", {
        text: "×",
        attr: { "aria-label": classificationText("remove", { value }) },
      });
      remove.type = "button";
      remove.addEventListener("click", () => removeValue(value));
    }
    options.replaceChildren();
    const query = input.value.normalize("NFKC").trim().toLocaleLowerCase();
    const selected = new Set(values.map((value) => value.toLocaleLowerCase()));
    const matches = suggestions
      .filter((value) => !selected.has(value.toLocaleLowerCase()))
      .filter((value) => !query || value.toLocaleLowerCase().includes(query))
      .slice(0, 12);
    for (const value of matches) {
      const option = options.createEl("button", { cls: "al-classification-option", text: value });
      option.type = "button";
      option.addEventListener("click", () => addValue(value));
    }
    add.textContent = input.value.trim()
      ? classificationText("addCustom", { value: input.value.trim() })
      : classificationText("add");
    add.disabled = !input.value.trim();
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addValue(input.value);
  });
  add.addEventListener("click", () => addValue(input.value));
  render();
  emit();
  return root;
}

function installMetadata(form: Element, result: ExternalMediaResult): void {
  form.querySelector(".al-classification-metadata")?.remove();
  const items = classificationMetadataForResult(result);
  if (!items.length) return;
  const root = createEl("section", { cls: "al-classification-metadata" });
  for (const item of items) {
    const field = root.createDiv({ cls: "al-form-field" });
    field.createSpan({ cls: "al-form-label", text: item.label });
    field.createDiv({ cls: "al-classification-meta-value", text: item.value });
  }
  const legacyField = findLegacyGenreField(form);
  if (legacyField) legacyField.insertAdjacentElement("beforebegin", root);
  else form.appendChild(root);
}

function installPickers(
  modal: ClassificationModal,
  initial: ClassificationSelection,
  onChange: (selection: ClassificationSelection) => void,
): void {
  const form = modal.contentEl.querySelector(".al-media-form");
  if (!form || form.querySelector(".al-classification-field")) return;
  const state = createClassificationSelection(initial.genres, initial.tags);
  const legacyField = findLegacyGenreField(form);
  const legacyInput = legacyField?.querySelector<HTMLInputElement>("input");
  const sync = (): void => {
    if (legacyInput) legacyInput.value = state.genres.join("、");
    onChange({ genres: [...state.genres], tags: [...state.tags] });
  };
  const genres = createPicker("genre", state.genres, (values) => { state.genres = values; sync(); });
  const tags = createPicker("tag", state.tags, (values) => { state.tags = values; sync(); });
  if (legacyField) {
    legacyField.replaceWith(genres, tags);
    if (legacyInput) {
      legacyInput.hidden = true;
      genres.appendChild(legacyInput);
    }
  } else {
    form.append(genres, tags);
  }
  sync();
}

function captureModal(openModal: () => void): ClassificationModal | null {
  const originalOpen = Modal.prototype.open;
  let captured: ClassificationModal | null = null;
  Modal.prototype.open = function capture(this: Modal): void {
    originalOpen.call(this);
    if (this.modalEl.classList.contains("animelist-modal")) captured = this as ClassificationModal;
  };
  try { openModal(); } finally { Modal.prototype.open = originalOpen; }
  return captured;
}

function installAniListSource(plugin: RuntimePlugin): void {
  const original = plugin.searchAniList.bind(plugin);
  plugin.searchAniList = async (mediaType, query) => {
    const results = await original(mediaType, query);
    try {
      const classifications = await fetchAniListClassifications(results, USER_AGENT);
      const enriched = mergeAniListClassifications(results, classifications);
      for (const result of enriched) {
        if (result.provider.toLocaleLowerCase() === "anilist") enrichedAniListResults.add(result);
      }
      return enriched;
    } catch (error) {
      console.warn("AnimeList could not enrich AniList classification metadata", error);
      return mergeAniListClassifications(results, new Map());
    }
  };
}

function installCreatePersistence(plugin: RuntimePlugin): void {
  const original = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const selection = pendingCreateClassification.get(result) ?? automaticClassificationForResult(result);
    pendingCreateClassification.delete(result);
    const normalized = createClassificationSelection(selection.genres, selection.tags);
    const file = await original(result, { ...form, genres: normalized.genres, tags: normalized.tags });
    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyClassificationFrontmatter(frontmatter, normalized);
    });
    return file;
  };
}

function installEditPersistence(plugin: RuntimePlugin): void {
  const manager = plugin.app.fileManager;
  const original = manager.processFrontMatter.bind(manager);
  manager.processFrontMatter = async (file, process) => original(file, (frontmatter) => {
    process(frontmatter);
    const pending = pendingEditClassification.get(file.path);
    if (!pending) return;
    writeClassificationSelection(frontmatter, pending);
    pendingEditClassification.delete(file.path);
  });
}

function installLibraryClassification(plugin: RuntimePlugin): void {
  const original = plugin.collectMediaItems.bind(plugin);
  plugin.collectMediaItems = (source) => original(source).map((item) => {
    const file = plugin.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) return item;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter?.media_type) return item;
    const selection = storedClassificationSelection(frontmatter);
    return { ...item, genres: selection.genres, tags: selection.tags };
  });
}

function installModalIntegration(plugin: RuntimePlugin): void {
  const originalAdd = plugin.openAddModal.bind(plugin);
  plugin.openAddModal = (initialType = "anime") => {
    const modal = captureModal(() => originalAdd(initialType));
    if (!modal?.renderDetails) return;
    const originalRenderDetails = modal.renderDetails.bind(modal);
    modal.renderDetails = async (result) => {
      await originalRenderDetails(result);
      if (result.provider.toLocaleLowerCase() === "anilist" && !enrichedAniListResults.has(result)) {
        try {
          const classifications = await fetchAniListClassifications([result], USER_AGENT);
          const [enriched] = mergeAniListClassifications([result], classifications);
          if (enriched) Object.assign(result, enriched);
        } catch (error) {
          console.warn("AnimeList could not enrich the selected AniList result", error);
          const [strictFallback] = mergeAniListClassifications([result], new Map());
          if (strictFallback) Object.assign(result, strictFallback);
        }
        enrichedAniListResults.add(result);
      }
      const automatic = automaticClassificationForResult(result);
      pendingCreateClassification.set(result, automatic);
      const form = modal.contentEl.querySelector(".al-media-form");
      if (form) installMetadata(form, result);
      installPickers(modal, automatic, (next) => {
        pendingCreateClassification.set(result, next);
      });
    };
  };

  const originalEdit = plugin.openEditModal.bind(plugin);
  plugin.openEditModal = (path) => {
    const modal = captureModal(() => originalEdit(path));
    const file = modal?.file ?? plugin.app.vault.getAbstractFileByPath(path);
    if (!modal || !(file instanceof TFile)) return;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    let selection = frontmatter ? storedClassificationSelection(frontmatter) : { genres: [], tags: [] };
    installPickers(modal, selection, (next) => { selection = next; });
    const save = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "儲存");
    save?.addEventListener("click", () => {
      pendingEditClassification.set(file.path, {
        genres: [...selection.genres],
        tags: [...selection.tags],
      });
      window.setTimeout(() => pendingEditClassification.delete(file.path), 10_000);
    }, { capture: true });
  };
}

export function installClassificationUi(plugin: Plugin): void {
  const runtime = plugin as RuntimePlugin;
  if (Reflect.get(runtime, PATCH_MARKER) === true) return;
  installAniListSource(runtime);
  installCreatePersistence(runtime);
  installEditPersistence(runtime);
  installLibraryClassification(runtime);
  installModalIntegration(runtime);
  Object.defineProperty(runtime, PATCH_MARKER, { value: true });
}

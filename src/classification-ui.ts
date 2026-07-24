import { Modal, TFile, type Plugin } from "obsidian";
import { fetchAniListClassifications, mergeAniListClassifications } from "./anilist-classification";
import { classificationText } from "./classification-feature-text";
import {
  classificationSuggestions,
  createClassificationSelection,
  normalizeClassificationValues,
  type ClassificationSelection,
} from "./media-classification";
import type { ExternalMediaResult, MediaNoteForm, MediaType } from "./types";
import { getScopedMarkdownFiles } from "./vault-scope";

const PATCH_MARKER = Symbol.for("animelist.media-classification");
const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const pendingEditTags = new Map<string, string[]>();

interface RuntimePlugin extends Plugin {
  searchAniList(mediaType: MediaType, query: string): Promise<ExternalMediaResult[]>;
  createMediaNote(result: ExternalMediaResult, form: MediaNoteForm): Promise<TFile>;
  openAddModal(initialType?: MediaType): void;
  openEditModal(path: string): void;
}

interface ClassificationModal extends Modal {
  renderDetails?: (result: ExternalMediaResult) => Promise<void>;
  file?: TFile;
}

export function applyClassificationFrontmatter(
  frontmatter: Record<string, unknown>,
  selection: ClassificationSelection,
): void {
  frontmatter.genres = [...selection.genres];
  if (selection.tags.length) frontmatter.tags = [...selection.tags];
  else delete frontmatter.tags;
}

function stringArray(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function vaultValues(plugin: RuntimePlugin, key: "genres" | "tags"): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const file of getScopedMarkdownFiles(plugin.app, [""])) {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter?.media_type) continue;
    for (const value of stringArray(frontmatter[key])) {
      const normalized = value.normalize("NFKC").trim();
      const comparison = normalized.toLocaleLowerCase();
      if (!normalized || seen.has(comparison)) continue;
      seen.add(comparison);
      output.push(normalized);
    }
  }
  return output;
}

function findLegacyGenreField(form: Element): HTMLElement | null {
  return Array.from(form.querySelectorAll<HTMLElement>(".al-form-field")).find((field) => {
    const label = field.querySelector(".al-form-label")?.textContent?.trim() ?? "";
    return label === "分類" || label === "作品類型" || /genre/i.test(label);
  }) ?? null;
}

function createPicker(
  kind: "genre" | "tag",
  initialValues: unknown,
  suggestions: string[],
  onChange: (values: string[]) => void,
): HTMLElement {
  let values = normalizeClassificationValues(initialValues, kind);
  const root = createEl("section", { cls: "al-classification-field" });
  const header = root.createDiv({ cls: "al-classification-header" });
  header.createEl("strong", { text: classificationText(kind === "genre" ? "genres" : "tags") });
  header.createEl("small", { text: classificationText(kind === "genre" ? "genresHint" : "tagsHint") });
  const chips = root.createDiv({ cls: "al-classification-chips" });
  const inputRow = root.createDiv({ cls: "al-classification-input-row" });
  const input = inputRow.createEl("input", { type: "search" });
  input.placeholder = classificationText("inputPlaceholder");
  const add = inputRow.createEl("button", { text: "新增" });
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
    if (!values.length) chips.createEl("span", { cls: "al-classification-empty", text: classificationText("empty") });
    for (const value of values) {
      const chip = chips.createEl("span", { cls: "al-classification-chip" });
      chip.append(value);
      const remove = chip.createEl("button", { text: "×", attr: { "aria-label": classificationText("remove", { value }) } });
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
      : "新增";
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

function installPickers(
  plugin: RuntimePlugin,
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
  const genres = createPicker(
    "genre",
    state.genres,
    classificationSuggestions("genre", vaultValues(plugin, "genres")),
    (values) => { state.genres = values; sync(); },
  );
  const tags = createPicker(
    "tag",
    state.tags,
    classificationSuggestions("tag", vaultValues(plugin, "tags")),
    (values) => { state.tags = values; sync(); },
  );
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
    const [results, classifications] = await Promise.all([
      original(mediaType, query),
      fetchAniListClassifications(mediaType, query, USER_AGENT),
    ]);
    return mergeAniListClassifications(results, classifications);
  };
}

function installCreatePersistence(plugin: RuntimePlugin): void {
  const original = plugin.createMediaNote.bind(plugin);
  plugin.createMediaNote = async (result, form) => {
    const selection = createClassificationSelection(form.genres ?? result.genres, form.tags ?? result.tags);
    const file = await original(result, { ...form, genres: selection.genres, tags: selection.tags });
    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyClassificationFrontmatter(frontmatter, selection);
    });
    return file;
  };
}

function installEditPersistence(plugin: RuntimePlugin): void {
  const manager = plugin.app.fileManager;
  const original = manager.processFrontMatter.bind(manager);
  manager.processFrontMatter = async (file, process) => original(file, (frontmatter) => {
    process(frontmatter);
    const tags = pendingEditTags.get(file.path);
    if (!tags) return;
    applyClassificationFrontmatter(frontmatter, {
      genres: normalizeClassificationValues(frontmatter.genres, "genre"),
      tags,
    });
    pendingEditTags.delete(file.path);
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
      installPickers(plugin, modal, createClassificationSelection(result.genres, result.tags), (next) => {
        result.genres = next.genres;
        result.tags = next.tags;
      });
    };
  };

  const originalEdit = plugin.openEditModal.bind(plugin);
  plugin.openEditModal = (path) => {
    const modal = captureModal(() => originalEdit(path));
    const file = modal?.file ?? plugin.app.vault.getAbstractFileByPath(path);
    if (!modal || !(file instanceof TFile)) return;
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    let selection = createClassificationSelection(frontmatter?.genres, frontmatter?.tags);
    installPickers(plugin, modal, selection, (next) => { selection = next; });
    const save = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "儲存");
    save?.addEventListener("click", () => {
      pendingEditTags.set(file.path, [...selection.tags]);
      window.setTimeout(() => pendingEditTags.delete(file.path), 10_000);
    }, { capture: true });
  };
}

export function installClassificationUi(plugin: Plugin): void {
  const runtime = plugin as RuntimePlugin;
  if (Reflect.get(runtime, PATCH_MARKER) === true) return;
  installAniListSource(runtime);
  installCreatePersistence(runtime);
  installEditPersistence(runtime);
  installModalIntegration(runtime);
  Object.defineProperty(runtime, PATCH_MARKER, { value: true });
}

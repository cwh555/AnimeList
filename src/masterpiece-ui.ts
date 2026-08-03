import { Modal, Notice, Setting, TFile } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "./app/feature-types";
import type { MediaItem } from "./types";
import {
  collectMasterpieceLabels,
  groupMasterpieceItems,
  labelsForMasterpieceEnable,
  matchesSpecialLabelFilter,
  normalizeMasterpieceLabel,
  normalizeMasterpieceLabels,
  normalizeSpecialLabelMode,
  stateAfterFavoriteChange,
  stateAfterMasterpieceSelection,
  type SpecialLabelMode,
} from "./masterpiece-labels";
import { masterpieceActionText, masterpieceFeatureText, specialLabelName } from "./masterpiece-feature-text";
import type { LibraryRenderAdapters, LibraryRenderContext } from "./ui/library-contracts";
import type { MediaFormContext } from "./ui/media-form-contracts";

interface MediaItemWithMasterpiece extends MediaItem {
  masterpieceLabels?: string[];
}

function modeOf(plugin: AnimeListFeatureHost): SpecialLabelMode {
  return normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
}

function labelsOf(item: MediaItem): string[] {
  return normalizeMasterpieceLabels((item as MediaItemWithMasterpiece).masterpieceLabels);
}

function labelsFromFrontmatter(frontmatter: Record<string, unknown> | undefined): string[] {
  const labels = normalizeMasterpieceLabels(frontmatter?.masterpiece_labels);
  return frontmatter?.favorite === true && labels.length === 0
    ? labelsForMasterpieceEnable(labels)
    : labels;
}

async function writeState(
  plugin: AnimeListFeatureHost,
  path: string,
  favorite: boolean,
  labels: string[],
): Promise<void> {
  await plugin.updateSpecialLabelState(path, favorite, labels);
}

function categoryNames(plugin: AnimeListFeatureHost): string[] {
  return collectMasterpieceLabels(plugin.collectMediaItems().map((item) => ({
    favorite: item.favorite,
    masterpieceLabels: labelsOf(item),
  })));
}

class MasterpieceSelectionModal extends Modal {
  private readonly selected: Set<string>;

  constructor(
    private readonly plugin: AnimeListFeatureHost,
    private readonly path: string,
    favorite: boolean,
    labels: string[],
    private readonly onSaved?: (favorite: boolean, labels: string[]) => void,
  ) {
    super(plugin.app);
    this.selected = new Set(favorite ? labelsForMasterpieceEnable(labels) : labels);
  }

  onOpen(): void {
    this.modalEl.addClass("animelist-modal", "al-masterpiece-selection-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: masterpieceFeatureText("modal.title") });
    this.contentEl.createEl("p", { text: masterpieceFeatureText("modal.description") });
    const form = this.contentEl.createDiv({ cls: "al-media-form" });
    const labels = [...new Set([...categoryNames(this.plugin), ...this.selected])]
      .sort((left, right) => left.localeCompare(right, "en"));

    for (const label of labels) {
      const row = form.createEl("label", { cls: "al-form-checkbox" });
      const checkbox = row.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selected.has(label);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(label);
        else this.selected.delete(label);
      });
      row.append(` ${label}`);
    }

    let newLabel = "";
    new Setting(this.contentEl)
      .setName(masterpieceFeatureText("modal.newLabel"))
      .addText((text) => text
        .setPlaceholder(masterpieceFeatureText("modal.newLabelPlaceholder"))
        .onChange((value: string) => { newLabel = normalizeMasterpieceLabel(value); }));

    const actions = this.contentEl.createDiv({ cls: "al-modal-actions" });
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: masterpieceFeatureText("modal.save"),
    });
    save.type = "button";
    save.addEventListener("click", () => {
      if (newLabel) this.selected.add(newLabel);
      const state = stateAfterMasterpieceSelection([...this.selected]);
      save.disabled = true;
      void writeState(this.plugin, this.path, state.favorite, state.masterpieceLabels)
        .then(() => {
          this.onSaved?.(state.favorite, state.masterpieceLabels);
          new Notice(masterpieceFeatureText("notice.saved"));
          this.close();
        })
        .catch((error: unknown) => {
          console.error("AnimeList masterpiece update failed", error);
          new Notice(masterpieceFeatureText("notice.failed"));
          save.disabled = false;
        });
    });
  }
}

function itemForCard(items: MediaItem[], card: HTMLElement): MediaItem | undefined {
  const path = card.dataset.path;
  if (path) return items.find((item) => item.filePath === path);
  const title = card.querySelector(".al-card-title")?.textContent ?? "";
  const original = card.querySelector(".al-original-title")?.textContent ?? "";
  return items.find((item) => item.title === title && (item.originalTitle ?? "") === original);
}

function bindClonedCard(card: HTMLElement, item: MediaItem, adapters: LibraryRenderAdapters): void {
  card.dataset.path = item.filePath;
  card.addEventListener("click", () => adapters.openFile?.(item.filePath));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    adapters.openFile?.(item.filePath);
  });
  card.querySelector<HTMLButtonElement>(".al-favorite-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(adapters.toggleFavorite?.(item.filePath, !item.favorite));
  });
  card.querySelector<HTMLButtonElement>(".al-edit-button")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    adapters.editItem?.(item.filePath);
  });
}

function decorateCards(context: LibraryRenderContext<AnimeListFeatureHost>): void {
  const mode = modeOf(context.host);
  context.container.querySelectorAll<HTMLElement>(".al-card").forEach((card) => {
    card.querySelectorAll(".al-masterpiece-tag").forEach((tag) => tag.remove());
    const item = itemForCard(context.items, card);
    if (!item) return;
    card.dataset.path = item.filePath;
    const favoriteButton = card.querySelector<HTMLElement>(".al-favorite-button");
    if (favoriteButton && mode === "masterpiece") {
      favoriteButton.title = item.favorite
        ? masterpieceFeatureText("library.editMasterpiece")
        : masterpieceFeatureText("library.addMasterpiece");
      favoriteButton.setAttribute("aria-label", favoriteButton.title);
    }
    if (mode !== "masterpiece" || !item.favorite) return;
    let tags = card.querySelector<HTMLElement>(".al-tags");
    if (!tags) {
      tags = card.createDiv({ cls: "al-tags" });
      card.querySelector(".al-progress")?.before(tags);
    }
    for (const label of labelsForMasterpieceEnable(labelsOf(item))) {
      tags.createSpan({ cls: "al-tag al-masterpiece-tag", text: label });
    }
  });
}

function renderGroups(context: LibraryRenderContext<AnimeListFeatureHost>): void {
  if (modeOf(context.host) !== "masterpiece" || context.state?.status !== "favorite") return;
  const root = context.container.querySelector<HTMLElement>(".al-grid");
  if (!root) return;
  const cards = [...root.querySelectorAll<HTMLElement>(":scope > .al-card")];
  if (!cards.length) return;
  const entries = cards.flatMap((card) => {
    const item = itemForCard(context.items, card);
    return item ? [{ ...item, card }] : [];
  });
  const groups = groupMasterpieceItems(entries);
  if (!groups.length) return;

  root.className = "al-masterpiece-groups";
  root.replaceChildren();
  const used = new Set<string>();
  for (const group of groups) {
    const section = root.createEl("section", { cls: "al-masterpiece-group" });
    section.dataset.groupKey = group.key;
    const heading = section.createDiv({ cls: "al-masterpiece-group-heading" });
    heading.createEl("h2", { cls: "al-masterpiece-group-title", text: group.label });
    heading.createSpan({ cls: "al-masterpiece-group-count", text: String(group.items.length) });
    const grid = section.createDiv({
      cls: `al-grid is-${context.state?.view ?? "grid"} al-masterpiece-group-grid`,
    });
    for (const entry of group.items) {
      let card = entry.card;
      if (used.has(entry.filePath)) {
        const cloned = entry.card.cloneNode(true);
        if (cloned.nodeType !== Node.ELEMENT_NODE) continue;
        card = cloned as HTMLElement;
        bindClonedCard(card, entry, context.adapters);
      } else {
        used.add(entry.filePath);
      }
      grid.appendChild(card);
    }
  }
}

function configureEditControl(context: MediaFormContext<AnimeListFeatureHost>): void {
  if (context.mode !== "edit" || !context.file || modeOf(context.host) !== "masterpiece") return;
  const row = context.fields.favorite.closest<HTMLElement>(".al-form-checkbox");
  if (!row) return;
  row.hidden = true;
  const button = createEl("button", { cls: "al-secondary-button al-masterpiece-edit-control" });
  button.type = "button";
  const update = (): void => {
    const favorite = context.fields.favorite.checked;
    button.replaceChildren();
    button.createSpan({ text: masterpieceActionText(favorite) });
    button.setAttribute("aria-label", masterpieceActionText(favorite));
  };
  update();
  button.addEventListener("click", () => {
    const labels = labelsFromFrontmatter(context.frontmatter);
    new MasterpieceSelectionModal(
      context.host,
      context.file?.path ?? "",
      context.fields.favorite.checked,
      labels,
      (favorite) => {
        context.fields.favorite.checked = favorite;
        update();
      },
    ).open();
  });
  row.insertAdjacentElement("afterend", button);
}

export const masterpieceFeature = defineFeature<AnimeListFeatureHost>({
  id: "masterpiece",
  contributions: [{
    kind: "lifecycle",
    activate(plugin): void {
      plugin.settings.specialLabelMode = normalizeSpecialLabelMode(plugin.settings.specialLabelMode);
    },
  }, {
    kind: "media-item",
    decorate(item, plugin): MediaItem {
      const file = plugin.app.vault.getAbstractFileByPath(item.filePath);
      const frontmatter = file instanceof TFile
        ? plugin.app.metadataCache.getFileCache(file)?.frontmatter
        : undefined;
      return { ...item, masterpieceLabels: labelsFromFrontmatter(frontmatter) } as MediaItem;
    },
  }, {
    kind: "library",
    prepareAdapters(adapters, { host }): LibraryRenderAdapters {
      const upstreamExtraFilters = adapters.extraStatusFilters;
      const upstreamMatcher = adapters.matchesStatusFilter;
      const upstreamRequiresCompleteDom = adapters.requiresCompleteDom;
      return {
        ...adapters,
        extraStatusFilters: (type) => [
          ...(upstreamExtraFilters?.(type) ?? []),
          ["favorite", specialLabelName(modeOf(host))],
        ],
        matchesStatusFilter: (item, filter) => {
          const special = matchesSpecialLabelFilter(item, filter);
          return typeof special === "boolean" ? special : upstreamMatcher?.(item, filter);
        },
        requiresCompleteDom: (state) => Boolean(
          upstreamRequiresCompleteDom?.(state)
          || (modeOf(host) === "masterpiece" && state.status === "favorite"),
        ),
      };
    },
    afterRender(context): void {
      decorateCards(context);
      renderGroups(context);
    },
  }, {
    kind: "favorite",
    async handle({ host, path, next }): Promise<boolean> {
      const file = host.app.vault.getAbstractFileByPath(path);
      const frontmatter = file instanceof TFile
        ? host.app.metadataCache.getFileCache(file)?.frontmatter
        : undefined;
      const labels = labelsFromFrontmatter(frontmatter);
      const favorite = frontmatter?.favorite === true;
      if (modeOf(host) === "masterpiece") {
        new MasterpieceSelectionModal(host, path, favorite, labels).open();
        return true;
      }
      if (next) {
        await host.setFavoriteDirect(path, true);
        return true;
      }
      const state = stateAfterFavoriteChange(labels, false);
      await writeState(host, path, state.favorite, state.masterpieceLabels);
      new Notice(masterpieceFeatureText("notice.removed"));
      return true;
    },
  }, {
    kind: "media-form",
    configure: configureEditControl,
  }, {
    kind: "settings",
    sections(plugin) {
      return {
        heading: masterpieceFeatureText("settings.heading"),
        definitions: [{
          name: masterpieceFeatureText("settings.mode.name"),
          desc: masterpieceFeatureText("settings.mode.desc"),
          render: (setting) => {
            setting.addDropdown((dropdown) => dropdown
              .addOption("favorite", masterpieceFeatureText("settings.mode.favorite"))
              .addOption("masterpiece", masterpieceFeatureText("settings.mode.masterpiece"))
              .setValue(modeOf(plugin))
              .onChange(async (value: string) => {
                plugin.settings.specialLabelMode = normalizeSpecialLabelMode(value);
                await plugin.saveSettings();
                plugin.refreshViews();
              }));
          },
        }],
      };
    },
  }],
});

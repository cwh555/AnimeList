import { App, Modal, Notice } from "obsidian";
import type { UserTagLibraryService, UserTagUsage } from "../data/user-tag-library-service";
import {
  addUserTagToCatalog,
  removeUserTagFromCatalog,
  renameUserTagInCatalog,
} from "../domain/user-tag-catalog";
import { normalizeUserTag } from "../domain/user-tags";
import { userTagText } from "../user-tag-text";
import { makeEl, setAnimeListIcon } from "./ui-helpers";

export interface UserTagManagerCallbacks {
  saveCatalog(next: string[]): Promise<void>;
  refreshViews(): void;
}

function tagKey(value: string): string {
  return value.toLocaleLowerCase();
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class UserTagManagerModal extends Modal {
  private catalog: string[];
  private selectedTag = "";
  private query = "";

  constructor(
    app: App,
    catalog: readonly string[],
    private readonly service: UserTagLibraryService,
    private readonly callbacks: UserTagManagerCallbacks,
  ) {
    super(app);
    this.catalog = [...catalog];
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-user-tag-modal");
    this.renderList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async persistCatalog(next: string[]): Promise<void> {
    if (sameTags(this.catalog, next)) return;
    this.catalog = next;
    await this.callbacks.saveCatalog(next);
  }

  private renderHeading(title: string, description: string): HTMLElement {
    const heading = makeEl("div", "al-modal-heading");
    heading.append(
      makeEl("h2", "", title),
      makeEl("p", "", description),
    );
    return heading;
  }

  private renderList(): void {
    this.selectedTag = "";
    this.contentEl.replaceChildren();
    this.contentEl.appendChild(this.renderHeading(
      userTagText("manager.title"),
      userTagText("manager.description"),
    ));

    const search = makeEl("label", "al-user-tag-search");
    const searchIcon = makeEl("span", "al-icon");
    setAnimeListIcon(searchIcon, "search");
    const searchInput = makeEl("input");
    searchInput.type = "search";
    searchInput.placeholder = userTagText("manager.searchPlaceholder");
    searchInput.value = this.query;
    searchInput.addEventListener("input", () => {
      this.query = searchInput.value.normalize("NFKC").trim().toLocaleLowerCase();
      this.renderTagRows(searchInput);
    });
    search.append(searchIcon, searchInput);
    this.contentEl.appendChild(search);

    const addRow = makeEl("div", "al-user-tag-add-row");
    const addInput = makeEl("input");
    addInput.type = "text";
    addInput.placeholder = userTagText("manager.addPlaceholder");
    addInput.autocomplete = "off";
    const addButton = makeEl("button", "mod-cta", userTagText("manager.add"));
    addButton.type = "button";
    const addTag = async (): Promise<void> => {
      const tag = normalizeUserTag(addInput.value);
      if (!tag) return;
      addButton.disabled = true;
      try {
        await this.persistCatalog(addUserTagToCatalog(this.catalog, tag));
        addInput.value = "";
        this.query = "";
        this.renderList();
      } finally {
        addButton.disabled = false;
      }
    };
    addButton.addEventListener("click", () => void addTag());
    addInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void addTag();
    });
    addRow.append(addInput, addButton);
    this.contentEl.appendChild(addRow);

    const list = makeEl("div", "al-user-tag-list");
    list.dataset.role = "tag-list";
    this.contentEl.appendChild(list);
    this.renderTagRows(searchInput);

    const actions = makeEl("div", "al-modal-actions");
    const close = makeEl("button", "", userTagText("manager.close"));
    close.type = "button";
    close.addEventListener("click", () => this.close());
    actions.appendChild(close);
    this.contentEl.appendChild(actions);

    window.setTimeout(() => searchInput.focus(), 0);
  }

  private renderTagRows(searchInput?: HTMLInputElement): void {
    const list = this.contentEl.querySelector<HTMLElement>('[data-role="tag-list"]');
    if (!list) return;
    list.replaceChildren();
    const counts = this.service.usageCounts();
    const visible = this.catalog
      .filter((tag) => !this.query || tag.toLocaleLowerCase().includes(this.query))
      .sort((left, right) => left.localeCompare(right, "zh-Hant"));

    if (!visible.length) {
      list.appendChild(makeEl(
        "div",
        "al-user-tag-empty",
        this.catalog.length ? userTagText("manager.noMatches") : userTagText("manager.empty"),
      ));
      return;
    }

    for (const tag of visible) {
      const row = makeEl("button", "al-user-tag-row");
      row.type = "button";
      row.append(
        makeEl("span", "al-user-tag-row-name", tag),
        makeEl("span", "al-user-tag-row-count", userTagText("manager.usageCount", {
          count: counts.get(tagKey(tag)) ?? 0,
        })),
      );
      row.addEventListener("click", () => {
        this.selectedTag = tag;
        this.renderDetail();
      });
      list.appendChild(row);
    }

    if (searchInput && document.activeElement !== searchInput) searchInput.focus();
  }

  private renderDetail(): void {
    const tag = this.selectedTag;
    if (!tag) {
      this.renderList();
      return;
    }

    this.contentEl.replaceChildren();
    const back = makeEl("button", "al-user-tag-back", userTagText("manager.back"));
    back.type = "button";
    back.addEventListener("click", () => this.renderList());
    this.contentEl.appendChild(back);
    this.contentEl.appendChild(this.renderHeading(
      tag,
      userTagText("manager.detailDescription"),
    ));

    const renameRow = makeEl("div", "al-user-tag-rename-row");
    const renameInput = makeEl("input");
    renameInput.type = "text";
    renameInput.value = tag;
    renameInput.autocomplete = "off";
    const renameButton = makeEl("button", "mod-cta", userTagText("manager.rename"));
    renameButton.type = "button";
    const deleteButton = makeEl("button", "mod-warning", userTagText("manager.delete"));
    deleteButton.type = "button";
    const cancelButton = makeEl("button", "", userTagText("manager.cancel"));
    cancelButton.type = "button";

    const setBusy = (busy: boolean): void => {
      renameButton.disabled = busy;
      deleteButton.disabled = busy;
      cancelButton.disabled = busy;
      renameInput.disabled = busy;
    };

    const renameTag = async (): Promise<void> => {
      const next = normalizeUserTag(renameInput.value);
      if (!next) return;
      setBusy(true);
      try {
        const result = await this.service.rename(tag, next);
        const nextCatalog = renameUserTagInCatalog(this.catalog, tag, next);
        await this.persistCatalog(nextCatalog);
        const nextKey = tagKey(next);
        this.selectedTag = this.catalog.find((entry) => tagKey(entry) === nextKey) ?? next;
        this.callbacks.refreshViews();
        new Notice(userTagText("notice.renamed", { count: result.changedNotes }));
        this.renderDetail();
      } finally {
        setBusy(false);
      }
    };

    renameButton.addEventListener("click", () => void renameTag());
    renameInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void renameTag();
    });

    deleteButton.addEventListener("click", () => {
      void (async () => {
        setBusy(true);
        try {
          const result = await this.service.remove(tag);
          await this.persistCatalog(removeUserTagFromCatalog(this.catalog, tag));
          this.callbacks.refreshViews();
          new Notice(userTagText("notice.deleted", { count: result.changedNotes }));
          this.renderList();
        } finally {
          setBusy(false);
        }
      })();
    });
    cancelButton.addEventListener("click", () => this.renderList());
    renameRow.append(renameInput, renameButton, deleteButton, cancelButton);
    this.contentEl.appendChild(renameRow);

    this.renderUsageList(tag, this.service.usages(tag));
    window.setTimeout(() => {
      renameInput.focus();
      renameInput.select();
    }, 0);
  }

  private renderUsageList(tag: string, usages: UserTagUsage[]): void {
    const section = makeEl("section", "al-user-tag-usage-section");
    section.appendChild(makeEl("h3", "", userTagText("manager.usedBy", { count: usages.length })));
    const list = makeEl("div", "al-user-tag-usage-list");
    if (!usages.length) {
      list.appendChild(makeEl("div", "al-user-tag-empty", userTagText("manager.unused")));
      section.appendChild(list);
      this.contentEl.appendChild(section);
      return;
    }

    for (const usage of usages) {
      const row = makeEl("div", "al-user-tag-usage-row");
      const title = makeEl("span", "al-user-tag-usage-title", usage.title);
      title.title = usage.filePath;
      const remove = makeEl("button", "al-user-tag-usage-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", userTagText("manager.removeFromWork", {
        tag,
        title: usage.title,
      }));
      remove.addEventListener("click", () => {
        void (async () => {
          remove.disabled = true;
          try {
            const result = await this.service.removeFromWork(tag, usage.filePath);
            if (result.changedNotes) {
              this.callbacks.refreshViews();
              new Notice(userTagText("notice.removedFromWork", { title: usage.title }));
            }
            this.renderDetail();
          } finally {
            remove.disabled = false;
          }
        })();
      });
      row.append(title, remove);
      list.appendChild(row);
    }
    section.appendChild(list);
    this.contentEl.appendChild(section);
  }
}

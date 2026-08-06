import { Notice, type Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "./app/feature-types";
import { UserTagLibraryService } from "./data/user-tag-library-service";
import {
  addUserTagToCatalog,
  mergeUserTagCatalog,
  removeUserTagFromCatalog,
  renameUserTagInCatalog,
} from "./domain/user-tag-catalog";
import { normalizeUserTag } from "./domain/user-tags";
import { userTagText } from "./user-tag-text";

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function saveCatalog(host: AnimeListFeatureHost, next: string[]): Promise<boolean> {
  if (sameTags(host.settings.tagCatalog, next)) return false;
  host.settings.tagCatalog = next;
  await host.saveSettings();
  return true;
}

function button(text: string, className = ""): HTMLButtonElement {
  const element = createEl("button");
  element.type = "button";
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderTagManager(setting: Setting, host: AnimeListFeatureHost): void {
  setting.controlEl.replaceChildren();
  setting.settingEl.classList.add("al-user-tag-setting");
  const root = createDiv();
  root.className = "al-user-tag-manager";
  setting.controlEl.appendChild(root);

  let activeTag = "";
  const service = new UserTagLibraryService(host.app, () => host.getScanFolders());

  const render = (): void => {
    root.replaceChildren();

    const addRow = createDiv();
    addRow.className = "al-user-tag-add-row";
    const addInput = createEl("input");
    addInput.type = "text";
    addInput.placeholder = userTagText("settings.addPlaceholder");
    addInput.autocomplete = "off";
    const addButton = button(userTagText("settings.add"), "mod-cta");
    const addTag = async (): Promise<void> => {
      const tag = normalizeUserTag(addInput.value);
      if (!tag) return;
      await saveCatalog(host, addUserTagToCatalog(host.settings.tagCatalog, tag));
      addInput.value = "";
      activeTag = "";
      render();
    };
    addButton.addEventListener("click", () => void addTag());
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void addTag();
      }
    });
    addRow.append(addInput, addButton);
    root.appendChild(addRow);

    const chips = createDiv();
    chips.className = "al-user-tag-catalog";
    for (const tag of host.settings.tagCatalog) {
      const chip = button(tag, `al-user-tag-catalog-chip${activeTag === tag ? " is-active" : ""}`);
      chip.setAttribute("aria-pressed", activeTag === tag ? "true" : "false");
      chip.addEventListener("click", () => {
        activeTag = activeTag === tag ? "" : tag;
        render();
      });
      chips.appendChild(chip);
    }
    if (!host.settings.tagCatalog.length) {
      const empty = createEl("small");
      empty.className = "al-user-tag-empty";
      empty.textContent = userTagText("settings.empty");
      chips.appendChild(empty);
    }
    root.appendChild(chips);

    if (!activeTag) return;
    const editor = createDiv();
    editor.className = "al-user-tag-editor";
    const editInput = createEl("input");
    editInput.type = "text";
    editInput.value = activeTag;
    editInput.autocomplete = "off";
    const rename = button(userTagText("settings.rename"), "mod-cta");
    const remove = button(userTagText("settings.delete"), "mod-warning");
    const cancel = button(userTagText("settings.cancel"));

    const renameTag = async (): Promise<void> => {
      const next = normalizeUserTag(editInput.value);
      if (!next) return;
      rename.disabled = true;
      remove.disabled = true;
      try {
        const result = await service.rename(activeTag, next);
        const catalog = renameUserTagInCatalog(host.settings.tagCatalog, activeTag, next);
        await saveCatalog(host, catalog);
        activeTag = "";
        host.refreshViews();
        new Notice(userTagText("notice.renamed", { count: result.changedNotes }));
        render();
      } finally {
        rename.disabled = false;
        remove.disabled = false;
      }
    };

    rename.addEventListener("click", () => void renameTag());
    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void renameTag();
      }
    });
    remove.addEventListener("click", () => {
      void (async () => {
        rename.disabled = true;
        remove.disabled = true;
        try {
          const result = await service.remove(activeTag);
          await saveCatalog(host, removeUserTagFromCatalog(host.settings.tagCatalog, activeTag));
          activeTag = "";
          host.refreshViews();
          new Notice(userTagText("notice.deleted", { count: result.changedNotes }));
          render();
        } finally {
          rename.disabled = false;
          remove.disabled = false;
        }
      })();
    });
    cancel.addEventListener("click", () => {
      activeTag = "";
      render();
    });

    editor.append(editInput, rename, remove, cancel);
    root.appendChild(editor);
    window.setTimeout(() => {
      editInput.focus();
      editInput.select();
    }, 0);
  };

  render();
}

export function createUserTagSettingsSection(host: AnimeListFeatureHost): FeatureSettingsSection {
  return {
    heading: userTagText("settings.heading"),
    description: userTagText("settings.description"),
    definitions: [{
      name: userTagText("settings.name"),
      desc: userTagText("settings.desc"),
      render: (setting: Setting) => renderTagManager(setting, host),
    }],
  };
}

export const userTagSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "user-tag-catalog",
  contributions: [
    {
      kind: "lifecycle",
      async activate(host) {
        const libraryTags = host.collectMediaItems().flatMap((item) => [
          ...item.genres,
          ...(item.userTags ?? []),
        ]);
        await saveCatalog(host, mergeUserTagCatalog(host.settings.tagCatalog, libraryTags));
      },
    },
    {
      kind: "media-form",
      async prepareSubmit(context) {
        await saveCatalog(
          context.host,
          mergeUserTagCatalog(context.host.settings.tagCatalog, context.form.genres),
        );
      },
    },
    {
      kind: "settings",
      sections(host) {
        return createUserTagSettingsSection(host);
      },
    },
  ],
});

import { Notice, TFile, setIcon } from "obsidian";
import type AnimeListPlugin from "./main";
import { masterpieceActionText, masterpieceFeatureText } from "./masterpiece-feature-text";
import { normalizeSpecialLabelMode } from "./masterpiece-labels";
import type { SpecialLabelMode } from "./masterpiece-labels";

interface MasterpieceSettings {
  specialLabelMode?: SpecialLabelMode;
}

type MasterpiecePlugin = AnimeListPlugin & {
  settings: AnimeListPlugin["settings"] & MasterpieceSettings;
};

const installedPlugins = new WeakSet<object>();

function currentFavorite(plugin: MasterpiecePlugin, path: string): boolean {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;
  return plugin.app.metadataCache.getFileCache(file)?.frontmatter?.favorite === true;
}

function updateControl(button: HTMLButtonElement, favorite: boolean): void {
  button.replaceChildren();
  setIcon(button, "star");
  button.createSpan({ text: masterpieceActionText(favorite) });
  button.setAttribute("aria-label", masterpieceActionText(favorite));
}

function decorateEditModal(plugin: MasterpiecePlugin, path: string): void {
  if (normalizeSpecialLabelMode(plugin.settings.specialLabelMode) !== "masterpiece") return;
  const modals = document.querySelectorAll<HTMLElement>(".animelist-edit-modal");
  const modal = modals.item(modals.length - 1);
  if (!modal || modal.dataset.masterpieceEditControl === "true") return;

  const favorite = modal.querySelector<HTMLInputElement>("label.al-form-checkbox input[type='checkbox']");
  const favoriteRow = favorite?.closest<HTMLElement>("label.al-form-checkbox");
  if (!favorite || !favoriteRow) return;

  modal.dataset.masterpieceEditControl = "true";
  favoriteRow.hidden = true;
  const button = createEl("button", {
    cls: "al-secondary-button al-masterpiece-edit-control",
  });
  button.type = "button";
  updateControl(button, currentFavorite(plugin, path));
  favoriteRow.insertAdjacentElement("afterend", button);

  const sync = (): void => {
    const nextFavorite = currentFavorite(plugin, path);
    favorite.checked = nextFavorite;
    updateControl(button, nextFavorite);
  };

  button.addEventListener("click", () => {
    button.disabled = true;
    void plugin.setFavorite(path, !favorite.checked)
      .catch((error: unknown) => {
        console.error("AnimeList masterpiece edit control failed", error);
        new Notice(masterpieceFeatureText("notice.failed"));
      })
      .finally(() => {
        button.disabled = false;
      });
  });

  const view = modal.ownerDocument.defaultView;
  const syncTimer = view?.setInterval(sync, 120);
  const observer = new MutationObserver(() => {
    if (modal.isConnected) return;
    if (syncTimer !== undefined) view?.clearInterval(syncTimer);
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function installMasterpieceEditUi(plugin: AnimeListPlugin): void {
  if (installedPlugins.has(plugin)) return;
  installedPlugins.add(plugin);
  const host = plugin as MasterpiecePlugin;
  const originalOpenEditModal = host.openEditModal.bind(host);
  host.openEditModal = (path: string): void => {
    originalOpenEditModal(path);
    queueMicrotask(() => decorateEditModal(host, path));
  };
}

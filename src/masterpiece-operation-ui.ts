import type AnimeListPlugin from "./main";
import { masterpieceFeatureText } from "./masterpiece-feature-text";
import { normalizeSpecialLabelMode } from "./masterpiece-labels";
import type { SpecialLabelMode } from "./masterpiece-labels";

interface MasterpieceSettings {
  specialLabelMode?: SpecialLabelMode;
}

interface MasterpiecePlugin {
  settings: MasterpieceSettings;
  setFavorite: (path: string, next: boolean) => Promise<void>;
}

const installedPlugins = new WeakSet<object>();

function decorateSelectionModal(): void {
  const modals = document.querySelectorAll<HTMLElement>(".animelist-modal");
  const modal = modals.item(modals.length - 1);
  if (!modal) return;
  const title = modal.querySelector("h2")?.textContent?.trim();
  if (title !== masterpieceFeatureText("modal.title")) return;

  modal.addClass("al-masterpiece-selection-modal");
  const removeButton = [...modal.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === masterpieceFeatureText("modal.remove"));
  removeButton?.remove();

  const newLabelSetting = [...modal.querySelectorAll<HTMLElement>(".setting-item")]
    .find((setting) => (
      setting.querySelector(".setting-item-name")?.textContent?.trim()
        === masterpieceFeatureText("modal.newLabel")
    ));
  newLabelSetting?.addClass("al-masterpiece-new-label-setting");
}

export function installMasterpieceOperationUi(plugin: AnimeListPlugin): void {
  if (installedPlugins.has(plugin)) return;
  installedPlugins.add(plugin);
  const host = plugin as unknown as MasterpiecePlugin;
  const originalSetFavorite = host.setFavorite;
  host.setFavorite = async (path: string, next: boolean): Promise<void> => {
    await originalSetFavorite(path, next);
    if (normalizeSpecialLabelMode(host.settings.specialLabelMode) !== "masterpiece") return;
    queueMicrotask(decorateSelectionModal);
  };
}

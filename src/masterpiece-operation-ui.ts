import type AnimeListPlugin from "./main";
import { AnimeListSettingTab } from "./settings";
import type { SettingsSection } from "./settings";
import { masterpieceFeatureText } from "./masterpiece-feature-text";
import { normalizeSpecialLabelMode } from "./masterpiece-labels";
import type { SpecialLabelMode } from "./masterpiece-labels";

interface MasterpieceSettings {
  specialLabelMode?: SpecialLabelMode;
}

type MasterpiecePlugin = AnimeListPlugin & {
  settings: AnimeListPlugin["settings"] & MasterpieceSettings;
};

type SettingSectionsMethod = (this: AnimeListSettingTab) => SettingsSection[];

const installedPlugins = new WeakSet<object>();
const installedSettings = new WeakSet<object>();

export function withoutMasterpieceCategorySettings(
  sections: SettingsSection[],
): SettingsSection[] {
  return sections.map((section) => {
    if (section.heading !== masterpieceFeatureText("settings.heading")) return section;
    return {
      ...section,
      definitions: section.definitions.filter((definition) => (
        definition.name !== masterpieceFeatureText("settings.labels.name")
      )),
    };
  });
}

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

function installSettingsFilter(): void {
  const prototype = AnimeListSettingTab.prototype;
  if (installedSettings.has(prototype)) return;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "getSettingSections");
  const original = descriptor?.value as SettingSectionsMethod | undefined;
  if (!original) return;
  installedSettings.add(prototype);

  prototype.getSettingSections = function (): SettingsSection[] {
    return withoutMasterpieceCategorySettings(original.call(this));
  };
}

export function installMasterpieceOperationUi(plugin: AnimeListPlugin): void {
  if (installedPlugins.has(plugin)) return;
  installedPlugins.add(plugin);
  const host = plugin as MasterpiecePlugin;
  installSettingsFilter();

  const originalSetFavorite = host.setFavorite.bind(host);
  host.setFavorite = async (path: string, next: boolean): Promise<void> => {
    await originalSetFavorite(path, next);
    if (normalizeSpecialLabelMode(host.settings.specialLabelMode) !== "masterpiece") return;
    queueMicrotask(decorateSelectionModal);
  };
}

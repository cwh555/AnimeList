import type { Setting, SettingDefinition } from "obsidian";
import type { AnimeListFeatureHost } from "../../app/feature-types";
import { TitleLocalizationModal } from "../../ui/title-localization-modal";
import { titleLocalizationSettingsText as text } from "./text";

/** The setting definition belongs to the title feature; the Legacy data page owns grouping. */
export function createTitleLocalizationSettingDefinition(
  host: AnimeListFeatureHost,
  open: () => void = () => new TitleLocalizationModal(host).open(),
): SettingDefinition {
  return {
    name: text("settings.name"),
    desc: "Choose a language and review proposed title changes. Original names and notes are preserved.",
    render(setting: Setting) {
      setting.addButton(button => {
        button.setButtonText(text("settings.button"));
        button.setCta();
        button.onClick(open);
      });
    },
  };
}

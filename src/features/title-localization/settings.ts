import type { Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { TitleLocalizationModal } from "../../ui/title-localization-modal";
import { titleLocalizationSettingsText as text } from "./text";

export const titleLocalizationSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "title-localization-settings",
  contributions: [{
    kind: "settings",
    sections(host) {
      return {
        page: "updates-cleanup",
        heading: text("settings.heading"),
        description: text("settings.description"),
        definitions: [{
          name: text("settings.name"),
          desc: text("settings.desc"),
          render(setting: Setting) {
            setting.addButton(button => {
              button.setButtonText(text("settings.button"));
              button.setCta();
              button.onClick(() => new TitleLocalizationModal(host).open());
            });
          },
        }],
      };
    },
  }],
});

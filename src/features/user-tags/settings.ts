import type { Setting } from "obsidian";
import { defineFeature, type AnimeListFeatureHost, type FeatureSettingsSection } from "../../app/feature-types";
import { UserTagLibraryService } from "../../data/user-tag-library-service";
import { mergeUserTagCatalog } from "../../domain/user-tag-catalog";
import { compatibleGenres } from "../../data/media-frontmatter-compat";
import { UserTagManagerModal } from "../../ui/user-tag-manager-modal";
import { userTagText } from "./text";

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function saveCatalog(host: AnimeListFeatureHost, next: string[]): Promise<boolean> {
  if (sameTags(host.settings.tagCatalog, next)) return false;
  host.settings.tagCatalog = next;
  await host.saveSettings();
  return true;
}

function renderTagManagerLauncher(setting: Setting, host: AnimeListFeatureHost): void {
  setting.addButton((button) => {
    button
      .setButtonText(userTagText("settings.manage"))
      .onClick(() => {
        void (async () => {
          const service = new UserTagLibraryService(host.app, () => host.getScanFolders());
          const catalog = mergeUserTagCatalog(host.settings.tagCatalog, service.collect());
          await saveCatalog(host, catalog);
          new UserTagManagerModal(host.app, catalog, service, {
            saveCatalog: async (next) => { await saveCatalog(host, next); },
            refreshViews: () => host.refreshViews(),
          }).open();
        })();
      });
  });
}

export function createUserTagSettingsSection(host: AnimeListFeatureHost): FeatureSettingsSection {
  return {
    heading: userTagText("settings.heading"),
    description: userTagText("settings.description"),
    definitions: [{
      name: userTagText("settings.name"),
      desc: userTagText("settings.desc"),
      render: (setting: Setting) => renderTagManagerLauncher(setting, host),
    }],
  };
}

export const userTagSettingsFeature = defineFeature<AnimeListFeatureHost>({
  id: "user-tag-catalog",
  contributions: [
    {
      kind: "media-form",
      async prepareSubmit(context) {
        const previousTags = context.mode === "edit"
          ? compatibleGenres(context.frontmatter)
          : [];
        await saveCatalog(
          context.host,
          mergeUserTagCatalog(context.host.settings.tagCatalog, [
            ...previousTags,
            ...(context.form.genres ?? []),
          ]),
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

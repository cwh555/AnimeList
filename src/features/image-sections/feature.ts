import type { Editor } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "../../app/feature-types";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { ImageSectionOrderJournal } from "../../data/image-section-order-journal";
import { IMAGE_SECTION_LANGUAGE, imageSectionInsertionPlan } from "../../domain/image-section";
import { registerMediaNoteInsertAction, renderAnimeListInsertMenu } from "../../ui/media-note-insert-menu";
import { ImageSectionRenderChild } from "../../ui/image-section-renderer";
import { ImageSectionOrderSession } from "../../ui/image-section-order-session";

const IMAGE_INSERT_ACTION = {
  id: "image-section",
  title: "Add image section",
  icon: "images",
  order: 20,
  insert(editor: Editor): void {
    const cursor = editor.getCursor("to");
    const plan = imageSectionInsertionPlan(cursor.line, editor.getLine(cursor.line));
    editor.replaceRange(plan.text, plan.at);
    editor.setCursor(plan.cursor);
  },
} as const;

export function addImageSectionContextMenu(menu: Parameters<typeof renderAnimeListInsertMenu>[0], editor: Editor): void {
  renderAnimeListInsertMenu(menu, editor, [IMAGE_INSERT_ACTION]);
}

export const imageSectionFeature: AnimeListFeature<AnimeListFeatureHost> = {
  id: "image-sections",
  contributions: [{
    kind: "lifecycle",
    async activate(host) {
      const service = imageSectionServiceForHost(host);
      const journal = new ImageSectionOrderJournal(
        host.app.vault.adapter,
        `${host.app.vault.configDir}/plugins/animelist/state/image-order`,
      );
      const orderSession = new ImageSectionOrderSession(journal, service);
      await orderSession.initialize();
      host.register(() => orderSession.dispose());
      host.registerMarkdownCodeBlockProcessor(IMAGE_SECTION_LANGUAGE, (source, element, context) => {
        context.addChild(new ImageSectionRenderChild(element, host, service, orderSession, source, context));
      });
      registerMediaNoteInsertAction(host, IMAGE_INSERT_ACTION);
    },
  }],
};

import type { Editor } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "./app/feature-types";
import { imageSectionServiceForHost } from "./data/image-section-service";
import { IMAGE_SECTION_LANGUAGE, imageSectionInsertionPlan } from "./domain/image-section";
import { registerMediaNoteInsertAction, renderAnimeListInsertMenu } from "./media-note-insert-menu";
import { ImageSectionRenderChild } from "./ui/image-section-renderer";

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
    activate(host) {
      const service = imageSectionServiceForHost(host);
      host.registerMarkdownCodeBlockProcessor(IMAGE_SECTION_LANGUAGE, (source, element, context) => {
        context.addChild(new ImageSectionRenderChild(element, host, service, source, context));
      });
      registerMediaNoteInsertAction(host, IMAGE_INSERT_ACTION);
    },
  }],
};

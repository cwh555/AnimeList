import type { Editor } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "../../app/feature-types";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import { MomentsService } from "../../data/moments-service";
import { MOMENTS_LANGUAGE, momentsInsertionPlan } from "../../domain/moments";
import { registerMediaNoteInsertAction } from "../../ui/media-note-insert-menu";
import { MomentsRenderChild } from "../../ui/moments-renderer";

const MOMENTS_INSERT_ACTION = {
  id: "moments-section",
  title: "Add moments section",
  icon: "quote",
  order: 10,
  insert(editor: Editor): void {
    const cursor = editor.getCursor("to");
    const plan = momentsInsertionPlan(cursor.line, editor.getLine(cursor.line));
    editor.replaceRange(plan.text, plan.at);
    editor.setCursor(plan.cursor);
  },
} as const;

export const momentsFeature: AnimeListFeature<AnimeListFeatureHost> = {
  id: "moments",
  dependsOn: ["image-sections"],
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      const imageService = imageSectionServiceForHost(host);
      const momentsService = new MomentsService(host, imageService);
      host.registerMarkdownCodeBlockProcessor(MOMENTS_LANGUAGE, (source, element, context) => {
        context.addChild(new MomentsRenderChild(element, host, momentsService, imageService, source, context));
      });
      registerMediaNoteInsertAction(host, MOMENTS_INSERT_ACTION);
    },
  }],
};

import { Modal } from "obsidian";
import type { MediaItem } from "../types";
import { normalizeTimelineMaxStackDepth } from "../timeline-scale";
import type { AnimeListUiHost } from "./plugin-host";
import { TimelineUI } from "./timeline-renderer";

export class TimelineModal extends Modal {
  constructor(
    private readonly plugin: AnimeListUiHost,
    private readonly items: MediaItem[],
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-timeline-modal");
    this.contentEl.replaceChildren();
    TimelineUI.render(this.contentEl, this.items, {
      maxStackDepth: normalizeTimelineMaxStackDepth(
        this.plugin.settings?.timelineMaxStackDepth,
      ),
      openFile: async (path: string) => {
        this.close();
        await this.plugin.app.workspace.openLinkText(path, "", false);
      },
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}


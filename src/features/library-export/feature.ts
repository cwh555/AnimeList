import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { LibraryExportModal } from "../../ui/library-export-modal";
import { libraryExportText } from "./text";

function openExport(host: AnimeListFeatureHost): void {
  new LibraryExportModal(host).open();
}

export const libraryExportFeature = defineFeature<AnimeListFeatureHost>({
  id: "library-export",
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      host.addCommand({
        id: "export-library",
        name: libraryExportText("command"),
        callback: () => openExport(host),
      });
    },
  }, {
    kind: "workspace-action",
    action(host) {
      return {
        id: "export-library",
        label: libraryExportText("action"),
        icon: "download",
        order: 20,
        run: () => openExport(host),
      };
    },
  }],
});

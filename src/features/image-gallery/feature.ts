import { TFile } from "obsidian";
import type { AnimeListFeature, AnimeListFeatureHost } from "../../app/feature-types";
import { imageGalleryServiceForHost } from "../../data/image-gallery-service";
import { imageSectionServiceForHost } from "../../data/image-section-service";
import type { ImageGalleryImage } from "../../domain/image-gallery";
import { ImageLightboxModal } from "../../ui/image-lightbox";
import {
  DEFAULT_IMAGE_GALLERY_STATE,
  renderImageGallery,
  type ImageGalleryUiState,
} from "../../ui/image-gallery-renderer";
import { makeEl, setAnimeListIcon } from "../../ui/ui-helpers";
import type { WorkspacePageRenderContext } from "../../ui/workspace-contracts";
import { imageGalleryText } from "./text";

const STATES = new WeakMap<object, ImageGalleryUiState>();

function stateFor(host: AnimeListFeatureHost): ImageGalleryUiState {
  return STATES.get(host) ?? { ...DEFAULT_IMAGE_GALLERY_STATE };
}

async function renderGalleryPage(
  host: AnimeListFeatureHost,
  container: HTMLElement,
  context: WorkspacePageRenderContext,
): Promise<void> {
  const keepCurrentSurface = context.samePageRefresh
    && container.querySelector(".al-image-gallery-page") !== null;
  if (!keepCurrentSurface) {
    container.replaceChildren();
    const loading = makeEl("div", "al-gallery-loading");
    const icon = makeEl("span", "al-gallery-loading-icon");
    setAnimeListIcon(icon, "images");
    loading.append(icon, makeEl("span", "", imageGalleryText("loading")));
    container.appendChild(loading);
  }

  const works = await imageGalleryServiceForHost(host).collect(host.collectMediaItems());
  if (context.signal.aborted || !container.isConnected) return;
  const imageService = imageSectionServiceForHost(host);
  renderImageGallery(container, works, stateFor(host), {
    resolve: (image) => imageService.resolve(image.path, image.sourcePath),
    openLightbox: (images: readonly ImageGalleryImage[], startIndex: number) => {
      new ImageLightboxModal(
        host.app,
        imageService,
        images.map((image) => ({ path: image.path, sourcePath: image.sourcePath })),
        startIndex,
      ).open();
    },
    openSource: (path) => host.openMediaFile(path),
    onStateChange: (state) => STATES.set(host, { ...state }),
  });
}

export const imageGalleryFeature = {
  id: "image-gallery",
  dependsOn: ["image-sections"],
  contributions: [{
    kind: "lifecycle" as const,
    activate(host: AnimeListFeatureHost): void {
      const service = imageGalleryServiceForHost(host);
      host.registerEvent(host.app.metadataCache.on("changed", (file) => {
        if (file instanceof TFile) service.invalidate(file.path);
      }));
      host.addCommand({
        id: "open-image-gallery",
        name: imageGalleryText("open"),
        callback: () => { void host.openLibrarySection("images"); },
      });
    },
  }, {
    kind: "workspace-page" as const,
    page(host: AnimeListFeatureHost) {
      return {
        id: "images" as const,
        label: imageGalleryText("title"),
        icon: "images",
        order: 40,
        render: (container: HTMLElement, context: WorkspacePageRenderContext) => renderGalleryPage(host, container, context),
      };
    },
  }],
} satisfies AnimeListFeature<AnimeListFeatureHost>;

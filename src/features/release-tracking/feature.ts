import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { installAutomaticChecks, serviceFor } from "./controller";
import { decorateDetail } from "./detail";
import { decorateReleaseCards, installLibraryRefreshButton } from "./library";
import { createReleaseTrackingSettingsSection } from "./settings";

export const releaseTrackingFeature = defineFeature<AnimeListFeatureHost>({
  id: "release-tracking",
  contributions: [{
    kind: "lifecycle",
    activate(host) {
      serviceFor(host);
      installAutomaticChecks(host);
    },
  }, {
    kind: "settings",
    sections(host) {
      return createReleaseTrackingSettingsSection(host);
    },
  }, {
    kind: "library",
    afterRender({ host, container, items }) {
      installLibraryRefreshButton(host, container);
      decorateReleaseCards(host, container, items);
    },
  }, {
    kind: "detail",
    afterRender({ container, frontmatter }) {
      decorateDetail(container, frontmatter);
    },
  }],
});

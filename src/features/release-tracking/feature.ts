import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { installAutomaticChecks, openReleaseDashboard, serviceFor } from "./controller";
import { decorateDetail } from "./detail";
import { decorateReleaseCards } from "./library";
import { createReleaseTrackingSettingsSection } from "./settings";
import { releaseTrackingText } from "./text";

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
      decorateReleaseCards(host, container, items);
    },
  }, {
    kind: "workspace-action",
    action(host) {
      if (!host.settings.releaseTracking.enabled) return null;
      return {
        id: "release-updates",
        label: releaseTrackingText("dashboard.title"),
        icon: "refresh-cw",
        order: 10,
        run: () => openReleaseDashboard(host),
      };
    },
  }, {
    kind: "detail",
    afterRender({ container, frontmatter }) {
      decorateDetail(container, frontmatter);
    },
  }],
});

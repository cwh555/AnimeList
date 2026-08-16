import type { Setting } from "obsidian";
import type { AnimeListFeatureHost, FeatureSettingsSection } from "../../app/feature-types";
import { ReleaseTrackingManagerModal } from "../../ui/release-tracking-manager-modal";
import { openReleaseDashboard, runAutomaticReleaseCheck, serviceFor } from "./controller";
import { releaseTrackingText } from "./text";

export function createReleaseTrackingSettingsSection(host: AnimeListFeatureHost): FeatureSettingsSection {
  return {
    heading: releaseTrackingText("settings.heading"),
    definitions: [{
      name: releaseTrackingText("settings.enabled.name"),
      desc: releaseTrackingText("settings.enabled.desc"),
      render: (setting: Setting) => {
        setting.addToggle((toggle) => {
          toggle.setValue(host.settings.releaseTracking.enabled);
          toggle.onChange(async (enabled) => {
            host.settings.releaseTracking.enabled = enabled;
            if (!enabled) host.settings.releaseTracking.automatic = false;
            await host.saveSettings();
            host.refreshViews();
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.automatic.name"),
      desc: releaseTrackingText("settings.automatic.desc"),
      render: (setting: Setting) => {
        setting.addToggle((toggle) => {
          toggle.setValue(host.settings.releaseTracking.automatic);
          toggle.onChange(async (automatic) => {
            host.settings.releaseTracking.automatic = automatic;
            if (automatic) host.settings.releaseTracking.lastAutomaticCheckAt = "";
            await host.saveSettings();
            if (automatic) void runAutomaticReleaseCheck(host);
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.manage.name"),
      desc: releaseTrackingText("settings.manage.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(releaseTrackingText("settings.manage.button"));
          button.onClick(() => {
            new ReleaseTrackingManagerModal(host.app, serviceFor(host), host.collectMediaItems(), {
              onApplied() { host.refreshViews(); },
            }).open();
          });
        });
      },
    }, {
      name: releaseTrackingText("settings.checkNow.name"),
      desc: releaseTrackingText("settings.checkNow.desc"),
      render: (setting: Setting) => {
        setting.addButton((button) => {
          button.setButtonText(releaseTrackingText("settings.checkNow.button"));
          button.onClick(() => { openReleaseDashboard(host); });
        });
      },
    }],
  };
}

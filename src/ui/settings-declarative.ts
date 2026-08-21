import type {
  SettingDefinition,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingDefinitionPage,
} from "obsidian";
import type { SettingsPageDefinition } from "../app/settings-layout";

export interface DeclarativeSettingsSection {
  heading?: string;
  description?: string;
  definitions: SettingDefinition[];
}

function sectionHeadingDefinition(section: DeclarativeSettingsSection): SettingDefinition | null {
  if (!section.heading) return null;
  return {
    name: section.heading,
    desc: section.description,
    searchable: false,
    render: (setting) => {
      setting.setHeading();
    },
  };
}

export function buildDeclarativeSettingsPage(
  page: SettingsPageDefinition,
  sections: readonly DeclarativeSettingsSection[],
): SettingDefinitionPage {
  const items: SettingDefinitionItem[] = sections.map((section): SettingDefinitionGroup => {
    const heading = sectionHeadingDefinition(section);
    return {
      type: "group",
      items: heading ? [heading, ...section.definitions] : [...section.definitions],
    };
  });

  return {
    type: "page",
    name: page.label,
    desc: page.description,
    items,
  };
}

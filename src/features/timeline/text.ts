import { defineTextCatalog } from "../../i18n/catalog";
import { TIMELINE_WORKSPACE_MESSAGES } from "../../i18n/locales/zh-TW/timeline-workspace";

export const TIMELINE_WORKSPACE_TEXT = TIMELINE_WORKSPACE_MESSAGES;
const CATALOG = defineTextCatalog("timeline-workspace", TIMELINE_WORKSPACE_TEXT);

export function timelineWorkspaceText(
  key: keyof typeof TIMELINE_WORKSPACE_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

import { defineTextCatalog } from "../../i18n/catalog";
import { RANKING_MESSAGES } from "../../i18n/locales/zh-TW/ranking";

const catalog = defineTextCatalog("ranking", RANKING_MESSAGES);
export function rankingText(key: keyof typeof RANKING_MESSAGES, variables: Record<string, string | number> = {}): string {
  return catalog.text(key, variables);
}

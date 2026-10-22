import { defineTextCatalog, withActiveLocale } from "../../i18n/catalog";
import { LEGACY_METADATA_MESSAGES } from "../../i18n/locales/zh-TW";

const CATALOG = defineTextCatalog("legacy-metadata", LEGACY_METADATA_MESSAGES);
export type LegacyMetadataTextKey = keyof typeof LEGACY_METADATA_MESSAGES;

export function legacyMetadataText(
  key: LegacyMetadataTextKey,
  params: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, params);
}

/** Settings actions must remain English independently of the workspace locale. */
export function legacyMetadataSettingsText(
  key: LegacyMetadataTextKey,
  params: Record<string, string | number> = {},
): string {
  return withActiveLocale("en", () => legacyMetadataText(key, params));
}

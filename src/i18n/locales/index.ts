import "../../features/release-tracking/text";
import "../../features/image-sections/text";
import "../../features/moments/text";
import { registerLocaleMessages } from "../catalog";
import { EN_CATALOGS } from "./en";
import { JA_CATALOGS } from "./ja";
import { KO_CATALOGS } from "./ko";
import { ZH_TW_CATALOGS, type LocaleCatalogs, type ZhTwCatalogNamespace } from "./zh-TW";

export const BUNDLED_LOCALE_CATALOGS = {
  "zh-TW": ZH_TW_CATALOGS,
  en: EN_CATALOGS,
  ja: JA_CATALOGS,
  ko: KO_CATALOGS,
} as const satisfies Record<string, LocaleCatalogs>;

export function registerBundledLocales(): void {
  for (const [locale, catalogs] of Object.entries(BUNDLED_LOCALE_CATALOGS)) {
    if (locale === "zh-TW") continue;
    for (const [namespace, messages] of Object.entries(catalogs)) {
      registerLocaleMessages(namespace as ZhTwCatalogNamespace, locale, messages as Record<string, string>);
    }
  }
}

export const SUPPORTED_LOCALES = ["zh-TW", "en", "ja", "ko"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export type LanguagePreference = SupportedLocale | "system";

export const DEFAULT_INTERFACE_LANGUAGE: LanguagePreference = "zh-TW";

export function normalizeSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") return null;
  const locale = value.trim().replaceAll("_", "-").toLowerCase();
  if (!locale) return null;
  if (locale === "zh" || locale.startsWith("zh-")) return "zh-TW";
  if (locale === "en" || locale.startsWith("en-")) return "en";
  if (locale === "ja" || locale.startsWith("ja-")) return "ja";
  if (locale === "ko" || locale.startsWith("ko-")) return "ko";
  return null;
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  if (value === "system") return "system";
  return normalizeSupportedLocale(value) ?? DEFAULT_INTERFACE_LANGUAGE;
}

export function resolveInterfaceLocale(
  preference: LanguagePreference,
  systemLocale?: unknown,
): SupportedLocale {
  if (preference !== "system") return preference;
  return normalizeSupportedLocale(systemLocale) ?? "zh-TW";
}

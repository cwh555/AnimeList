export type LocaleCode = string;
export type TextVariables = Readonly<Record<string, string | number>>;
export type TextMessages = Readonly<Record<string, string>>;

interface CatalogState {
  readonly defaultLocale: LocaleCode;
  readonly messagesByLocale: Map<LocaleCode, TextMessages>;
}

const CATALOGS = new Map<string, CatalogState>();
let activeLocale: LocaleCode = "zh-TW";

export function interpolateText(template: string, variables: TextVariables = {}): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

export function setActiveLocale(locale: LocaleCode): void {
  activeLocale = locale.trim() || "zh-TW";
}

export function getActiveLocale(): LocaleCode {
  return activeLocale;
}

export function registerLocaleMessages<T extends TextMessages>(
  namespace: string,
  locale: LocaleCode,
  messages: Partial<T>,
): void {
  const state = CATALOGS.get(namespace);
  if (!state) throw new Error(`Unknown text catalog namespace: ${namespace}`);
  const fallback = state.messagesByLocale.get(state.defaultLocale) ?? {};
  const existing = state.messagesByLocale.get(locale) ?? fallback;
  state.messagesByLocale.set(locale, { ...existing, ...messages });
}

export interface TextCatalog<T extends TextMessages> {
  readonly namespace: string;
  readonly defaultMessages: T;
  text<K extends keyof T & string>(key: K, variables?: TextVariables): string;
}

export function defineTextCatalog<const T extends TextMessages>(
  namespace: string,
  defaultMessages: T,
  defaultLocale: LocaleCode = "zh-TW",
): TextCatalog<T> {
  if (CATALOGS.has(namespace)) throw new Error(`Duplicate text catalog namespace: ${namespace}`);
  const state: CatalogState = {
    defaultLocale,
    messagesByLocale: new Map([[defaultLocale, defaultMessages]]),
  };
  CATALOGS.set(namespace, state);

  return {
    namespace,
    defaultMessages,
    text(key, variables = {}) {
      const localized = state.messagesByLocale.get(activeLocale);
      const fallback = state.messagesByLocale.get(defaultLocale) ?? defaultMessages;
      const template = localized?.[key] ?? fallback[key];
      if (typeof template !== "string") {
        throw new Error(`Missing text key ${namespace}.${String(key)} for locale ${activeLocale}`);
      }
      return interpolateText(template, variables);
    },
  };
}

export function resetLocaleForTests(): void {
  activeLocale = "zh-TW";
}

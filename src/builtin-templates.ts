import type { MediaType, TemplateOption } from "./types";
import { uiText } from "./ui-text";

export const BUILTIN_TEMPLATE_PREFIX = "builtin:";

const MINIMAL_TEMPLATE = `# {{title}}\n\n> Added on {{date}} at {{time}}.\n`;

export const BUILTIN_TEMPLATES: Record<string, string> = {
  // Keep the legacy keys as aliases so notes created by older test builds remain readable.
  "builtin:anime-review": MINIMAL_TEMPLATE,
  "builtin:anime-episode-notes": MINIMAL_TEMPLATE,
  "builtin:manga-reading-notes": MINIMAL_TEMPLATE,
  "builtin:novel-reading-notes": MINIMAL_TEMPLATE,
  "builtin:plain": MINIMAL_TEMPLATE,
};

export function getBuiltInTemplateOptions(_mediaType: MediaType): TemplateOption[] {
  return [{ path: "builtin:plain", name: uiText("template.builtinPlain") }];
}

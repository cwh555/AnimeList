export const LIBRARY_TEXT_TEMPLATE_MAX_LENGTH = 4096;
export const LIBRARY_TEXT_TEMPLATE_MAX_VARIABLES = 64;

export const LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS = [
  "completedAt",
  "work",
  "seriesTitle",
  "mediaType",
  "unit",
  "originalTitle",
  "score",
  "progress",
  "startedAt",
  "status",
  "favorite",
  "genres",
] as const;

export type LibraryTextTemplateVariableId = (typeof LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS)[number];

export interface LibraryTextTemplateCatalog {
  names: Readonly<Record<LibraryTextTemplateVariableId, string>>;
}

export type LibraryTextTemplateIssueCode =
  | "empty-template"
  | "template-too-long"
  | "unclosed-variable"
  | "unknown-variable"
  | "too-many-variables"
  | "missing-completed-at"
  | "missing-work";

export interface LibraryTextTemplateIssue {
  code: LibraryTextTemplateIssueCode;
  variable?: string;
}

export type LibraryTextTemplateSegment =
  | { kind: "text"; value: string }
  | { kind: "variable"; id: LibraryTextTemplateVariableId };

export interface LibraryTextTemplateCompilation {
  template: string;
  segments: LibraryTextTemplateSegment[];
  variables: Set<LibraryTextTemplateVariableId>;
  issues: LibraryTextTemplateIssue[];
  valid: boolean;
}

const ESCAPED_OPEN = "\u0000ANIMELIST_TEMPLATE_OPEN\u0000";

function variableLookup(catalog: LibraryTextTemplateCatalog): Map<string, LibraryTextTemplateVariableId> {
  const lookup = new Map<string, LibraryTextTemplateVariableId>();
  for (const id of LIBRARY_TEXT_TEMPLATE_VARIABLE_IDS) {
    lookup.set(id, id);
    lookup.set(catalog.names[id], id);
  }
  return lookup;
}

function normalizedTemplate(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function compileLibraryTextTemplate(
  source: string,
  catalog: LibraryTextTemplateCatalog,
): LibraryTextTemplateCompilation {
  const template = normalizedTemplate(source);
  const issues: LibraryTextTemplateIssue[] = [];
  const segments: LibraryTextTemplateSegment[] = [];
  const variables = new Set<LibraryTextTemplateVariableId>();

  if (!template.trim()) issues.push({ code: "empty-template" });
  if (template.length > LIBRARY_TEXT_TEMPLATE_MAX_LENGTH) issues.push({ code: "template-too-long" });

  const lookup = variableLookup(catalog);
  const escaped = template.replaceAll("\\{$", ESCAPED_OPEN);
  let cursor = 0;
  let variableCount = 0;

  while (cursor < escaped.length) {
    const start = escaped.indexOf("{$", cursor);
    if (start < 0) {
      const tail = escaped.slice(cursor).replaceAll(ESCAPED_OPEN, "{$");
      if (tail) segments.push({ kind: "text", value: tail });
      break;
    }

    const literal = escaped.slice(cursor, start).replaceAll(ESCAPED_OPEN, "{$");
    if (literal) segments.push({ kind: "text", value: literal });

    const end = escaped.indexOf("}", start + 2);
    if (end < 0) {
      issues.push({ code: "unclosed-variable" });
      const tail = escaped.slice(start).replaceAll(ESCAPED_OPEN, "{$");
      if (tail) segments.push({ kind: "text", value: tail });
      cursor = escaped.length;
      break;
    }

    const rawName = escaped.slice(start + 2, end).trim();
    const id = lookup.get(rawName);
    variableCount += 1;
    if (variableCount > LIBRARY_TEXT_TEMPLATE_MAX_VARIABLES) {
      if (!issues.some((issue) => issue.code === "too-many-variables")) {
        issues.push({ code: "too-many-variables" });
      }
    }
    if (!id) {
      issues.push({ code: "unknown-variable", variable: rawName });
    } else {
      variables.add(id);
      segments.push({ kind: "variable", id });
    }
    cursor = end + 1;
  }

  if (!variables.has("completedAt")) issues.push({ code: "missing-completed-at" });
  if (!variables.has("work")) issues.push({ code: "missing-work" });

  return {
    template,
    segments,
    variables,
    issues,
    valid: issues.length === 0,
  };
}

export function renderLibraryTextTemplate(
  compilation: LibraryTextTemplateCompilation,
  values: Readonly<Record<LibraryTextTemplateVariableId, string>>,
): string {
  if (!compilation.valid) return "";
  return compilation.segments.map((segment) => (
    segment.kind === "text" ? segment.value : values[segment.id]
  )).join("");
}

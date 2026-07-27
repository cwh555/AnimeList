import { normalizeMediaStatus } from "../media-status";
import { normalizeGenres } from "../domain/media-metadata";
import type {
  ExternalMediaResult,
  MediaNoteForm,
  MediaType,
  ProgressValue,
} from "../domain/media-types";
import {
  asArray,
  currentTimeString,
  numeric,
  stringValue,
  todayString,
} from "../domain/value-normalization";
import {
  normalizeProgressValue,
  normalizeReleaseStatus,
  normalizeVolumeLog,
  serializeVolumeLog,
} from "../novel-progress";
import { CURRENT_MEDIA_SCHEMA_VERSION } from "../schema-migration";
import { completedRequirementMessage, uiText } from "../ui-text";

export interface TemplateContext {
  title?: string;
  originalTitle?: string;
  mediaType?: string;
  cover?: string;
  coverUrl?: string;
  summary?: string;
  sourceUrl?: string;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(stringValue(value));
}

function yamlArray(lines: string[], key: string, values: unknown): void {
  const clean = asArray(values).map((value) => stringValue(value).trim()).filter(Boolean);
  if (!clean.length) return;
  lines.push(`${key}:`);
  clean.forEach((value) => lines.push(`  - ${yamlScalar(value)}`));
}

function yamlVolumeLog(lines: string[], entries: unknown): void {
  const serialized = serializeVolumeLog(normalizeVolumeLog(entries));
  if (!serialized.length) return;
  lines.push("volume_log:");
  for (const entry of serialized) {
    lines.push(`  - label: ${yamlScalar(entry.label)}`);
    Object.entries(entry).forEach(([key, value]) => {
      if (key === "label" || value === "") return;
      lines.push(`    ${key}: ${yamlScalar(value)}`);
    });
  }
}

export function stripTemplateFrontmatter(content: unknown): string {
  const text = stringValue(content).replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return text;
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function applyTemplateVariables(content: unknown, context: TemplateContext): string {
  const values: Record<string, string> = {
    title: context.title || "",
    date: todayString(),
    time: currentTimeString(),
    original_title: context.originalTitle || "",
    media_type: context.mediaType || "",
    cover: context.cover || context.coverUrl || "",
    summary: context.summary || "",
    source_url: context.sourceUrl || "",
  };
  return stringValue(content).replace(
    /\{\{\s*([a-zA-Z_]+)(?::[^}]*)?\s*\}\}/g,
    (match, key: string) => Object.hasOwn(values, key) ? values[key] : match,
  );
}

export function ensureDetailBlock(body: unknown, title: string): string {
  const detail = "```animelist-detail\n```";
  let text = stringValue(body).trim();
  if (!text) text = `# ${title}\n\n> Added on ${todayString()} at ${currentTimeString()}.`;
  if (text.includes("```animelist-detail")) return text;
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (headingIndex >= 0) lines.splice(headingIndex + 1, 0, "", detail);
  else lines.unshift(`# ${title}`, "", detail, "");
  return lines.join("\n");
}

export function completedProgress(
  status: unknown,
  total: unknown,
  current: unknown,
  mediaType: MediaType = "anime",
): ProgressValue {
  const safeCurrent = mediaType === "novel"
    ? normalizeProgressValue(current)
    : Math.max(0, numeric(current));
  if (mediaType !== "anime") return safeCurrent;
  const safeTotal = Math.max(0, numeric(total));
  return status === "completed" && safeTotal > 0 ? safeTotal : safeCurrent;
}

export interface ValidatedMediaNoteForm {
  title: string;
  status: ReturnType<typeof normalizeMediaStatus>;
  score: number | null;
  completedAt: string;
}

export function validateMediaNoteForm(
  result: ExternalMediaResult,
  form: MediaNoteForm,
): ValidatedMediaNoteForm {
  const title = stringValue(form.title).trim();
  const hasScore = form.score !== "" && form.score != null;
  const score = hasScore ? Number(form.score) : null;
  const completedAt = stringValue(form.completedAt).trim();
  const status = normalizeMediaStatus(form.status);
  if (!title) throw new Error(uiText("validation.titleRequired"));
  if (status === "completed" && !hasScore) {
    throw new Error(completedRequirementMessage(result.mediaType, uiText("field.score")));
  }
  if (hasScore && (score == null || !Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error(uiText("validation.scoreRange"));
  }
  if (status === "completed" && !completedAt) {
    throw new Error(completedRequirementMessage(result.mediaType, uiText("field.completedAt")));
  }
  return { title, status, score, completedAt };
}

export function buildMediaMarkdown(
  result: ExternalMediaResult,
  form: MediaNoteForm,
  coverPath: string,
  templateContent = "",
): string {
  const { title, status, score, completedAt } = validateMediaNoteForm(result, form);

  const total = result.mediaType === "anime"
    ? Math.max(0, numeric(form.total ?? result.total))
    : 0;
  const progress = completedProgress(status, total, form.progress, result.mediaType);
  const genres = normalizeGenres(form.genres?.length ? form.genres : result.genres);
  const releaseStatus = result.mediaType === "anime"
    ? "unknown"
    : normalizeReleaseStatus(form.releaseStatus || result.releaseStatus);
  const volumeLog = result.mediaType === "novel" ? normalizeVolumeLog(form.volumeLog) : [];
  const lines = ["---", `schema_version: ${CURRENT_MEDIA_SCHEMA_VERSION}`];

  lines.push(`title: ${yamlScalar(title)}`);
  if (result.originalTitle) lines.push(`title_original: ${yamlScalar(result.originalTitle)}`);
  if (result.romajiTitle && result.romajiTitle !== result.originalTitle) {
    lines.push(`title_romaji: ${yamlScalar(result.romajiTitle)}`);
  }
  lines.push(`media_type: ${yamlScalar(result.mediaType)}`);
  lines.push(`format: ${yamlScalar(result.format || result.mediaType)}`);
  lines.push(`status: ${yamlScalar(status)}`);
  if (result.mediaType !== "anime") lines.push(`release_status: ${yamlScalar(releaseStatus)}`);
  lines.push(`progress: ${yamlScalar(progress)}`);
  if (result.mediaType === "anime") lines.push(`progress_total: ${yamlScalar(total)}`);
  lines.push(`progress_unit: ${yamlScalar(form.unit || result.unit)}`);
  if (score != null) lines.push(`score: ${score}`);
  lines.push(`favorite: ${form.favorite === true ? "true" : "false"}`);
  if (result.year) lines.push(`year: ${numeric(result.year)}`);
  if (form.startedAt) lines.push(`started_at: ${yamlScalar(form.startedAt)}`);
  if (completedAt) lines.push(`completed_at: ${yamlScalar(completedAt)}`);
  yamlVolumeLog(lines, volumeLog);
  if (coverPath || result.coverUrl) lines.push(`cover: ${yamlScalar(coverPath || result.coverUrl)}`);
  if (result.coverUrl) lines.push(`cover_remote: ${yamlScalar(result.coverUrl)}`);
  yamlArray(lines, "genres", genres);
  const rawGenres = asArray(result.rawGenres)
    .map(String)
    .filter((value) => value && !genres.includes(value));
  yamlArray(lines, "source_genres", rawGenres);
  if (result.mediaType === "anime") yamlArray(lines, "studios", result.people);
  else yamlArray(lines, "authors", result.people);
  yamlArray(lines, "platforms", result.platforms);
  lines.push(`source_provider: ${yamlScalar(result.provider)}`);
  if (result.sourceId) lines.push(`source_id: ${yamlScalar(result.sourceId)}`);
  yamlArray(lines, "source_urls", result.sourceUrl ? [result.sourceUrl] : []);
  if (result.externalScore != null) lines.push(`source_score: ${numeric(result.externalScore)}`);
  if (form.templatePath) lines.push(`note_template: ${yamlScalar(form.templatePath)}`);
  lines.push("---", "");

  const applied = applyTemplateVariables(stripTemplateFrontmatter(templateContent), {
    title,
    originalTitle: result.originalTitle,
    mediaType: result.mediaType,
    cover: coverPath,
    coverUrl: result.coverUrl,
    summary: result.summary,
    sourceUrl: result.sourceUrl,
  });
  let body = ensureDetailBlock(applied, title);
  if (coverPath && !body.includes(coverPath)) {
    body = body.replace(/(```animelist-detail\n```)/, `$1\n\n![[${coverPath}|260]]`);
  } else if (!coverPath && result.coverUrl && !body.includes(result.coverUrl)) {
    body = body.replace(
      /(```animelist-detail\n```)/,
      `$1\n\n![${uiText("library.coverAlt", { title })}](${result.coverUrl})`,
    );
  }
  lines.push(body.trim(), "");
  return lines.join("\n");
}

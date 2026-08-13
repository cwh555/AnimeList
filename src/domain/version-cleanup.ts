import { normalizePath } from "obsidian";
import { stringValue } from "./value-normalization";

export const REMOVE_DUPLICATE_COVER_TASK_ID = "remove-duplicate-default-cover";

export interface LegacyCoverCleanupCandidate {
  lineIndex: number;
  lineNumber: number;
  lineText: string;
  coverPath: string;
}

function mediaType(value: unknown): boolean {
  return value === "anime" || value === "manga" || value === "novel";
}

function coverPath(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw || /^https?:\/\//i.test(raw)) return "";
  const wiki = raw.match(/^!?\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  return normalizePath((wiki?.[1] ?? raw).trim());
}

function generatedCoverPath(line: string): string {
  const match = line.match(/^\s*!\[\[([^\]|]+)\|260\]\]\s*$/);
  return match ? normalizePath(match[1].trim()) : "";
}

export function findLegacyDefaultCoverCandidate(
  markdown: string,
  frontmatter: Record<string, unknown>,
): LegacyCoverCleanupCandidate | null {
  if (!mediaType(frontmatter.media_type)) return null;
  if (stringValue(frontmatter.note_template).trim()) return null;
  const expectedCover = coverPath(frontmatter.cover);
  if (!expectedCover) return null;

  const lines = markdown.split(/\r?\n/);
  const candidates: LegacyCoverCleanupCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*```animelist-detail\s*$/.test(lines[index])) continue;
    let close = index + 1;
    while (close < lines.length && !/^\s*```\s*$/.test(lines[close])) close += 1;
    if (close >= lines.length) continue;
    let next = close + 1;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    if (next >= lines.length) continue;
    const path = generatedCoverPath(lines[next]);
    if (!path || path !== expectedCover) continue;
    candidates.push({
      lineIndex: next,
      lineNumber: next + 1,
      lineText: lines[next],
      coverPath: path,
    });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function removeLegacyDefaultCoverLine(
  markdown: string,
  candidate: LegacyCoverCleanupCandidate,
): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  if (lines[candidate.lineIndex] !== candidate.lineText) return markdown;
  lines.splice(candidate.lineIndex, 1);

  // Collapse only the extra blank line created by removing the generated embed.
  const before = candidate.lineIndex - 1;
  const after = candidate.lineIndex;
  if (before >= 0 && after < lines.length && lines[before].trim() === "" && lines[after].trim() === "") {
    lines.splice(after, 1);
  }
  return lines.join(newline);
}

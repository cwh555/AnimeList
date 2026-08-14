import { normalizeImageSectionPath } from "./image-section";
import { stringValue } from "./value-normalization";

export const MOMENTS_LANGUAGE = "animelist-moments";

export interface MomentItem {
  id: string;
  text: string;
  source?: string;
  position?: string;
  speaker?: string;
  tags?: string[];
  note?: string;
  images: string[];
}

export interface MomentsLocator {
  source: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface MomentsBlock {
  lineStart: number;
  lineEnd: number;
  source: string;
  moments: MomentItem[];
}

export interface MomentsInsertionPlan {
  at: { line: number; ch: number };
  text: string;
  cursor: { line: number; ch: number };
}

export function momentsInsertionPlan(line: number, lineText: string): MomentsInsertionPlan {
  const safeLine = Math.max(0, Math.trunc(line));
  const content = String(lineText ?? "");
  const blank = content.trim().length === 0;
  const prefix = blank ? "" : "\n\n";
  const text = `${prefix}\`\`\`${MOMENTS_LANGUAGE}\nmoments: []\n\`\`\`\n`;
  return {
    at: { line: safeLine, ch: blank ? 0 : content.length },
    text,
    cursor: { line: safeLine + (blank ? 3 : 5), ch: 0 },
  };
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    try { return String(JSON.parse(trimmed)); } catch { return trimmed.slice(1, trimmed.endsWith('"') ? -1 : undefined); }
  }
  if (trimmed.startsWith("'")) {
    const body = trimmed.endsWith("'") ? trimmed.slice(1, -1) : trimmed.slice(1);
    return body.replace(/''/g, "'");
  }
  if (/^(?:null|~)$/i.test(trimmed)) return "";
  return trimmed;
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function normalizeOptional(value: unknown): string | undefined {
  const normalized = stringValue(value).replace(/\r\n?/g, "\n").trim();
  return normalized || undefined;
}

function normalizeTags(value: Iterable<string> | undefined): string[] | undefined {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of value ?? []) {
    const normalized = stringValue(entry).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags.length ? tags : undefined;
}

function normalizedMoment(input: Partial<MomentItem>): MomentItem {
  const images: string[] = [];
  const seen = new Set<string>();
  for (const image of input.images ?? []) {
    const path = normalizeImageSectionPath(image);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    images.push(path);
  }
  const source = normalizeOptional(input.source);
  const position = normalizeOptional(input.position);
  const speaker = normalizeOptional(input.speaker);
  const tags = normalizeTags(input.tags);
  const note = normalizeOptional(input.note);
  return {
    id: stringValue(input.id).trim(),
    text: stringValue(input.text).replace(/\r\n?/g, "\n").replace(/\n+$/g, ""),
    ...(source ? { source } : {}),
    ...(position ? { position } : {}),
    ...(speaker ? { speaker } : {}),
    ...(tags ? { tags } : {}),
    ...(note ? { note } : {}),
    images,
  };
}

function parseBlockText(lines: string[], indexRef: { value: number }): string {
  indexRef.value += 1;
  const body: string[] = [];
  while (indexRef.value < lines.length) {
    const textLine = lines[indexRef.value];
    if (textLine.trim() === "") {
      body.push("");
      indexRef.value += 1;
      continue;
    }
    if (!/^\s{6}/.test(textLine)) break;
    body.push(textLine.slice(6));
    indexRef.value += 1;
  }
  return body.join("\n").replace(/\n+$/g, "");
}

export function parseMomentsSource(source: unknown): MomentItem[] {
  const lines = stringValue(source).replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.trim() && !line.trim().startsWith("#"));
  if (first < 0) return [];
  if (/^moments:\s*\[\s*\]\s*$/.test(lines[first].trim())) return [];
  if (!/^moments:\s*$/.test(lines[first].trim())) return [];

  const moments: MomentItem[] = [];
  let index = first + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) { index += 1; continue; }
    const itemStart = /^\s{2}-\s+id:\s*(.*)$/.exec(line);
    if (!itemStart) { index += 1; continue; }

    const item: Partial<MomentItem> = { id: parseScalar(itemStart[1]), text: "", images: [] };
    index += 1;
    while (index < lines.length && !/^\s{2}-\s+id:\s*/.test(lines[index])) {
      const current = lines[index];
      const textBlock = /^\s{4}text:\s*\|[-+]?\s*$/.exec(current);
      if (textBlock) {
        const holder = { value: index };
        item.text = parseBlockText(lines, holder);
        index = holder.value;
        continue;
      }
      const noteBlock = /^\s{4}note:\s*\|[-+]?\s*$/.exec(current);
      if (noteBlock) {
        const holder = { value: index };
        item.note = parseBlockText(lines, holder);
        index = holder.value;
        continue;
      }
      const textScalar = /^\s{4}text:\s*(.*)$/.exec(current);
      if (textScalar) {
        item.text = parseScalar(textScalar[1]);
        index += 1;
        continue;
      }
      const sourceScalar = /^\s{4}source:\s*(.*)$/.exec(current);
      if (sourceScalar) {
        item.source = parseScalar(sourceScalar[1]);
        index += 1;
        continue;
      }
      const positionScalar = /^\s{4}position:\s*(.*)$/.exec(current);
      if (positionScalar) {
        item.position = parseScalar(positionScalar[1]);
        index += 1;
        continue;
      }
      const speakerScalar = /^\s{4}speaker:\s*(.*)$/.exec(current);
      if (speakerScalar) {
        item.speaker = parseScalar(speakerScalar[1]);
        index += 1;
        continue;
      }
      const noteScalar = /^\s{4}note:\s*(.*)$/.exec(current);
      if (noteScalar) {
        item.note = parseScalar(noteScalar[1]);
        index += 1;
        continue;
      }
      if (/^\s{4}tags:\s*(?:\[\s*\])?\s*$/.test(current)) {
        index += 1;
        const tags: string[] = [];
        while (index < lines.length) {
          const tagLine = /^\s{6}-\s*(.*)$/.exec(lines[index]);
          if (!tagLine) break;
          const value = parseScalar(tagLine[1]);
          if (value) tags.push(value);
          index += 1;
        }
        item.tags = tags;
        continue;
      }
      if (/^\s{4}images:\s*(?:\[\s*\])?\s*$/.test(current)) {
        index += 1;
        const images: string[] = [];
        while (index < lines.length) {
          const imageLine = /^\s{6}-\s*(.*)$/.exec(lines[index]);
          if (!imageLine) break;
          const path = normalizeImageSectionPath(parseScalar(imageLine[1]));
          if (path) images.push(path);
          index += 1;
        }
        item.images = images;
        continue;
      }
      index += 1;
    }
    moments.push(normalizedMoment(item));
  }
  return moments;
}

export function serializeMomentsSource(values: Iterable<MomentItem>): string {
  const moments = [...values].map((value) => normalizedMoment(value));
  if (!moments.length) return "moments: []";
  const lines = ["moments:"];
  for (const moment of moments) {
    lines.push(`  - id: ${quoteYaml(moment.id)}`);
    lines.push("    text: |-");
    const textLines = moment.text.split("\n");
    if (textLines.length === 1 && textLines[0] === "") lines.push("      ");
    else textLines.forEach((line) => lines.push(`      ${line}`));
    if (moment.source) lines.push(`    source: ${quoteYaml(moment.source)}`);
    if (moment.position) lines.push(`    position: ${quoteYaml(moment.position)}`);
    if (moment.speaker) lines.push(`    speaker: ${quoteYaml(moment.speaker)}`);
    if (moment.tags?.length) {
      lines.push("    tags:");
      moment.tags.forEach((tag) => lines.push(`      - ${quoteYaml(tag)}`));
    }
    if (moment.note) {
      lines.push("    note: |-");
      const noteLines = moment.note.split("\n");
      if (noteLines.length === 1 && noteLines[0] === "") lines.push("      ");
      else noteLines.forEach((line) => lines.push(`      ${line}`));
    }
    if (moment.images.length) {
      lines.push("    images:");
      moment.images.forEach((path) => lines.push(`      - ${quoteYaml(path)}`));
    } else {
      lines.push("    images: []");
    }
  }
  return lines.join("\n");
}

export function findMomentsBlocks(markdown: unknown): MomentsBlock[] {
  const text = stringValue(markdown);
  const lines = text.split(/\r?\n/);
  const blocks: MomentsBlock[] = [];
  for (let lineStart = 0; lineStart < lines.length; lineStart += 1) {
    if (!/^\s*```animelist-moments(?:\s.*)?\s*$/.test(lines[lineStart])) continue;
    let lineEnd = lineStart + 1;
    while (lineEnd < lines.length && !/^\s*```\s*$/.test(lines[lineEnd])) lineEnd += 1;
    if (lineEnd >= lines.length) continue;
    const source = lines.slice(lineStart + 1, lineEnd).join("\n");
    blocks.push({ lineStart, lineEnd, source, moments: parseMomentsSource(source) });
    lineStart = lineEnd;
  }
  return blocks;
}

function sameMomentsSource(left: string, right: string): boolean {
  return serializeMomentsSource(parseMomentsSource(left)) === serializeMomentsSource(parseMomentsSource(right));
}

function locateMomentsBlock(markdown: string, locator: MomentsLocator): MomentsBlock {
  const blocks = findMomentsBlocks(markdown);
  const hint = typeof locator.lineStart === "number" ? locator.lineStart : null;
  if (hint !== null) {
    const containing = blocks.find((block) => hint >= block.lineStart && hint <= block.lineEnd);
    if (containing) return containing;
  }
  const matches = blocks.filter((block) => sameMomentsSource(block.source, locator.source));
  if (matches.length === 1) return matches[0];
  if (hint !== null && matches.length > 1) {
    return [...matches].sort((left, right) => (
      Math.abs(left.lineStart - hint) - Math.abs(right.lineStart - hint)
    ))[0];
  }
  throw new Error("Could not safely locate this moments section in the note");
}

export function replaceMoments(
  markdown: unknown,
  locator: MomentsLocator,
  moments: Iterable<MomentItem>,
): string {
  const text = stringValue(markdown);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const block = locateMomentsBlock(text, locator);
  const source = serializeMomentsSource(moments);
  const replacement = [lines[block.lineStart], ...source.split("\n"), lines[block.lineEnd]];
  lines.splice(block.lineStart, block.lineEnd - block.lineStart + 1, ...replacement);
  return lines.join(newline);
}

export function allMomentIds(markdown: unknown): string[] {
  const ids: string[] = [];
  for (const block of findMomentsBlocks(markdown)) {
    for (const moment of block.moments) if (moment.id) ids.push(moment.id);
  }
  return ids;
}

export function hasUniqueMomentIdsInMarkdown(markdown: unknown): boolean {
  const ids = allMomentIds(markdown);
  return ids.length === new Set(ids).size
    && findMomentsBlocks(markdown).every((block) => hasUniqueMomentIds(block.moments));
}

export function allMomentImagePaths(markdown: unknown): string[] {
  const unique = new Set<string>();
  for (const block of findMomentsBlocks(markdown)) {
    for (const moment of block.moments) {
      for (const path of moment.images) unique.add(path);
    }
  }
  return [...unique];
}

export function createMomentId(
  existingIds: Iterable<string>,
  candidateFactory: () => string = () => crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): string {
  const existing = new Set([...existingIds].map((value) => String(value).trim()).filter(Boolean));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `m_${String(candidateFactory()).replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
    if (candidate.length > 6 && !existing.has(candidate)) return candidate;
  }
  throw new Error("Could not create a unique moment id");
}

export function hasUniqueMomentIds(moments: Iterable<MomentItem>): boolean {
  const seen = new Set<string>();
  for (const moment of moments) {
    if (!moment.id || seen.has(moment.id)) return false;
    seen.add(moment.id);
  }
  return true;
}

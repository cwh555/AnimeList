import type { MediaItem } from "./media-types";

/** Conservative title matching only affects question order, never the ranking. */
export function rankingSeriesKey(item: Pick<MediaItem, "title" | "originalTitle">): string {
  const raw = (item.originalTitle || item.title).normalize("NFKC").toLowerCase().trim();
  const withoutEdition = raw
    .replace(/[（(【[]?\s*(?:第\s*[一二三四五六七八九十\d]+\s*(?:季|期|部|章)|(?:season|series|part)\s*\d+|s\d+|\d+(?:st|nd|rd|th)\s+season|(?:the\s+)?movie|film|劇場版|电影版|電影版|特別篇|特别篇|ova|oad)(?:\s*[)）】\]])?\s*$/giu, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  return withoutEdition.length >= 3 ? withoutEdition : raw.replace(/\s+/g, "");
}

function hash(input: string): number {
  let value = 2166136261;
  for (const char of input) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

/** Circle-schedule matchings: across n-1 (n even) or n (n odd)
 * complete starts, each first-stage pair is distinct. This is deliberate
 * diversity, unlike repeatedly invoking Math.random() with no guarantees.
 */
export function diverseRankingOrder(items: readonly MediaItem[], generation: number): string[] {
  const unique = [...new Map(items.map(item => [item.filePath, item])).values()];
  if (unique.length <= 1) return unique.map(item => item.filePath);
  const sorted = unique.sort((a, b) =>
    hash(a.filePath) - hash(b.filePath) || a.filePath.localeCompare(b.filePath));
  const pool: Array<MediaItem | null> = [...sorted];
  if (pool.length % 2) pool.push(null);
  const fixed = pool[0];
  const rest = pool.slice(1);
  const cycle = rest.length;
  const turn = ((generation % cycle) + cycle) % cycle;
  const rotated = [...rest.slice(turn), ...rest.slice(0, turn)];
  const ring = [fixed, ...rotated];
  const pairs: Array<{ entries: MediaItem[]; collision: number; bias: number }> = [];
  for (let index = 0; index < ring.length / 2; index += 1) {
    const a = ring[index], b = ring[ring.length - 1 - index];
    const entries = [a, b].filter((item): item is MediaItem => item != null);
    pairs.push({
      entries,
      collision: entries.length === 2 && rankingSeriesKey(entries[0]) === rankingSeriesKey(entries[1]) ? 1 : 0,
      bias: hash(entries.map(item => item.filePath).join("|") + ":" + generation),
    });
  }
  // Colliding series are delayed until the end of the first stage.
  // An odd-sized round has one bye. Keep it last so flattening does not
  // accidentally pair members of two otherwise independent matches.
  pairs.sort((a, b) => (a.entries.length === 1 ? 1 : 0) - (b.entries.length === 1 ? 1 : 0)
    || a.collision - b.collision || a.bias - b.bias);
  return pairs.flatMap(({ entries }) => entries.map(item => item.filePath));
}

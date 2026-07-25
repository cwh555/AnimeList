import { requestUrl } from "obsidian";

const USER_AGENT = "AnimeList-Obsidian/1.1.2 (local personal media library)";
const CACHE = new Map<string, string[]>();

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendUnique(output: string[], value: unknown): void {
  const clean = stringValue(value);
  if (!clean || output.some((entry) => entry.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
  output.push(clean);
}

function infoboxAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const key = stringValue(row.key).toLocaleLowerCase();
    if (!["别名", "別名", "中文名", "简体中文名", "簡體中文名", "繁体中文名", "繁體中文名"].includes(key)) continue;
    const raw = row.value;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (isRecord(entry)) appendUnique(output, entry.v ?? entry.k);
        else appendUnique(output, entry);
      }
    } else if (isRecord(raw)) appendUnique(output, raw.v ?? raw.k);
    else appendUnique(output, raw);
  }
  return output;
}

export async function fetchBangumiSubjectTitles(sourceId: string): Promise<string[]> {
  const id = sourceId.trim();
  if (!/^\d+$/.test(id)) return [];
  const cached = CACHE.get(id);
  if (cached) return [...cached];
  const response = await requestUrl({
    url: `https://api.bgm.tv/v0/subjects/${id}`,
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    throw: false,
  });
  const status = Number(response.status || 200);
  if (status < 200 || status >= 300) throw new Error(`Bangumi subject lookup failed with HTTP ${status}.`);
  const payload = (response.json ?? JSON.parse(response.text || "{}")) as unknown;
  if (!isRecord(payload)) return [];
  const titles: string[] = [];
  appendUnique(titles, payload.name);
  appendUnique(titles, payload.name_cn);
  for (const alias of infoboxAliases(payload.infobox)) appendUnique(titles, alias);
  CACHE.set(id, titles);
  return [...titles];
}

export const bangumiSubjectTest = {
  reset(): void { CACHE.clear(); },
};

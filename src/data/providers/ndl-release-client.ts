import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { NdlCatalog, NdlPublicationRecord } from "../../domain/release-tracking";

const NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch";
const NDL_CATALOG_DPID: Record<NdlCatalog, string> = {
  "jpro-book": "jpro-book",
  "ndl-national": "iss-ndl-opac-national",
};
export const NDL_CATALOGS: readonly NdlCatalog[] = ["jpro-book", "ndl-national"];

function text(value: Element | null | undefined): string {
  return value?.textContent?.trim() ?? "";
}

function descendants(item: Element, localNames: readonly string[]): Element[] {
  const expected = new Set(localNames.map((value) => value.toLocaleLowerCase()));
  return Array.from(item.getElementsByTagName("*")).filter((element) =>
    expected.has((element.localName || element.tagName).toLocaleLowerCase()));
}

function firstText(item: Element, localNames: readonly string[]): string {
  for (const localName of localNames) {
    const value = descendants(item, [localName]).map(text).find(Boolean);
    if (value) return value;
  }
  return "";
}

function allText(item: Element, localNames: readonly string[]): string[] {
  return [...new Set(descendants(item, localNames).map(text).filter(Boolean))];
}

function alternativeTitles(item: Element): string[] {
  const values: string[] = [];
  for (const alternative of descendants(item, ["alternative", "alternativeTitle"])) {
    const nestedValue = firstText(alternative, ["value"]);
    const value = nestedValue || text(alternative);
    if (value) values.push(value);
  }
  return [...new Set(values)];
}

function isbnFromIdentifiers(values: readonly string[]): string {
  for (const value of values) {
    const normalized = value.replace(/[^0-9Xx]/g, "");
    if (normalized.length === 10 || normalized.length === 13) return normalized.toUpperCase();
  }
  return "";
}

function parseItem(item: Element, catalog: NdlCatalog): NdlPublicationRecord | null {
  const link = firstText(item, ["link"]);
  const guid = firstText(item, ["guid", "identifier"]);
  const title = firstText(item, ["title"]);
  if (!title) return null;
  const identifiers = allText(item, ["identifier"]);
  return {
    sourceId: guid || link || title,
    sourceUrl: link,
    title,
    seriesTitle: firstText(item, ["seriesTitle"]),
    volume: firstText(item, ["volume"]),
    creators: allText(item, ["creator"]),
    publisher: firstText(item, ["publisher"]),
    publishedAt: firstText(item, ["issued", "date", "publicationDate"]),
    isbn: isbnFromIdentifiers(identifiers),
    alternativeTitles: alternativeTitles(item),
    catalog,
  };
}

function recordKey(record: NdlPublicationRecord): string {
  return record.isbn || record.sourceId || [record.title, record.volume, record.publisher, record.publishedAt]
    .map((value) => value.trim().normalize("NFKC").toLocaleLowerCase())
    .join("\u0000");
}

export class NdlReleaseClient {
  async searchCatalog(catalog: NdlCatalog, title: string): Promise<NdlPublicationRecord[]> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return [];
    const parameters = new URLSearchParams({
      dpid: NDL_CATALOG_DPID[catalog],
      cnt: "200",
      mediatype: "books",
      title: normalizedTitle,
    });
    const response = await requestUrl({
      url: `${NDL_OPENSEARCH}?${parameters.toString()}`,
      method: "GET",
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
        "User-Agent": USER_AGENT,
      },
    });
    const document = new DOMParser().parseFromString(response.text || "", "application/xml");
    if (document.querySelector("parsererror")) throw new Error("NDL Search returned invalid XML.");
    return Array.from(document.getElementsByTagName("item"))
      .map((item) => parseItem(item, catalog))
      .filter((record): record is NdlPublicationRecord => record !== null);
  }

  async search(title: string, catalogs: readonly NdlCatalog[] = NDL_CATALOGS): Promise<NdlPublicationRecord[]> {
    const records = new Map<string, NdlPublicationRecord>();
    const failures: unknown[] = [];
    for (const catalog of catalogs) {
      try {
        for (const record of await this.searchCatalog(catalog, title)) {
          const key = recordKey(record);
          if (!records.has(key)) records.set(key, record);
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (records.size) return [...records.values()];
    if (failures.length === catalogs.length && catalogs.length > 0) throw failures[0];
    return [];
  }

  async searchTitles(
    titles: readonly string[],
    catalogs: readonly NdlCatalog[] = NDL_CATALOGS,
  ): Promise<NdlPublicationRecord[]> {
    const records = new Map<string, NdlPublicationRecord>();
    for (const title of [...new Set(titles.map((value) => value.trim()).filter(Boolean))]) {
      for (const record of await this.search(title, catalogs)) {
        const key = recordKey(record);
        if (!records.has(key)) records.set(key, record);
      }
    }
    return [...records.values()];
  }
}

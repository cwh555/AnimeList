import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { NdlPublicationRecord } from "../../domain/release-tracking";

const NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch";

function text(value: Element | null | undefined): string {
  return value?.textContent?.trim() ?? "";
}

function descendants(item: Element, localNames: readonly string[]): Element[] {
  const expected = new Set(localNames.map((value) => value.toLocaleLowerCase()));
  return Array.from(item.getElementsByTagName("*")).filter((element) =>
    expected.has((element.localName || element.tagName).toLocaleLowerCase()));
}

function firstText(item: Element, localNames: readonly string[]): string {
  return descendants(item, localNames).map(text).find(Boolean) ?? "";
}

function allText(item: Element, localNames: readonly string[]): string[] {
  return [...new Set(descendants(item, localNames).map(text).filter(Boolean))];
}

function isbnFromIdentifiers(values: readonly string[]): string {
  for (const value of values) {
    const normalized = value.replace(/[^0-9Xx]/g, "");
    if (normalized.length === 10 || normalized.length === 13) return normalized.toUpperCase();
  }
  return "";
}

function parseItem(item: Element): NdlPublicationRecord | null {
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
  };
}

export class NdlReleaseClient {
  async search(title: string, creator = ""): Promise<NdlPublicationRecord[]> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return [];
    const parameters = new URLSearchParams({
      dpid: "jpro-book",
      cnt: "100",
      mediatype: "books",
      title: normalizedTitle,
    });
    if (creator.trim()) parameters.set("creator", creator.trim());
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
      .map(parseItem)
      .filter((record): record is NdlPublicationRecord => record !== null);
  }

  async searchTitles(titles: readonly string[], creator = ""): Promise<NdlPublicationRecord[]> {
    const records = new Map<string, NdlPublicationRecord>();
    for (const title of [...new Set(titles.map((value) => value.trim()).filter(Boolean))]) {
      for (const record of await this.search(title, creator)) {
        const key = record.sourceId || `${record.title}\u0000${record.volume}\u0000${record.publisher}`;
        records.set(key, record);
      }
    }
    return [...records.values()];
  }
}

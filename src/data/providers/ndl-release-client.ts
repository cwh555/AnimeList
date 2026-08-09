import { requestUrl } from "obsidian";
import { USER_AGENT } from "../../app-metadata";
import type { NdlPublicationRecord } from "../../domain/release-tracking";

const NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch";
const NDL_PUBLICATION_PROVIDERS = ["jpro-book", "iss-ndl-opac-national"] as const;

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
  private async searchProvider(
    provider: typeof NDL_PUBLICATION_PROVIDERS[number],
    title: string,
    creator: string,
  ): Promise<NdlPublicationRecord[]> {
    const parameters = new URLSearchParams({
      dpid: provider,
      cnt: "200",
      mediatype: "books",
      title,
    });
    if (creator) parameters.set("creator", creator);
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

  async search(title: string, creator = ""): Promise<NdlPublicationRecord[]> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return [];
    const normalizedCreator = creator.trim();
    const records = new Map<string, NdlPublicationRecord>();
    const failures: unknown[] = [];

    // JPRO is best for current publication dates; the national bibliography
    // supplies historical domestic volumes that JPRO may not retain. Both are
    // queried through the same NDL Search API, sequentially to avoid bursty access.
    for (const provider of NDL_PUBLICATION_PROVIDERS) {
      try {
        for (const record of await this.searchProvider(provider, normalizedTitle, normalizedCreator)) {
          // Prefer JPRO when both providers describe the same ISBN because it
          // commonly carries the more precise current release date.
          const key = record.isbn || [record.title, record.volume, record.publisher, record.publishedAt]
            .map((value) => value.trim().normalize("NFKC").toLocaleLowerCase())
            .join("\u0000");
          if (!records.has(key)) records.set(key, record);
        }
      } catch (error) {
        failures.push(error);
      }
    }

    if (records.size) return [...records.values()];
    if (failures.length === NDL_PUBLICATION_PROVIDERS.length) throw failures[0];
    return [];
  }

  async searchTitles(titles: readonly string[], creator = ""): Promise<NdlPublicationRecord[]> {
    const records = new Map<string, NdlPublicationRecord>();
    for (const title of [...new Set(titles.map((value) => value.trim()).filter(Boolean))]) {
      for (const record of await this.search(title, creator)) {
        const key = record.isbn || record.sourceId || `${record.title}\u0000${record.volume}\u0000${record.publisher}`;
        if (!records.has(key)) records.set(key, record);
      }
    }
    return [...records.values()];
  }
}

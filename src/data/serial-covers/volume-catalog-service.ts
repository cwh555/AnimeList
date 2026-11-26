import type { ProviderSettings } from "../../domain/settings-types";
import { bangumiBookMediaType } from "../../domain/bangumi-book-type";
import type { ExternalMediaResult } from "../../domain/media-types";
import { matchesCatalogVolume, seriesIdentity, type VolumeCatalogRequest, type VolumeCatalogResult } from "../../domain/serial-covers/catalog";
import type { SerialCoverCandidate } from "../../domain/serial-covers/ranking";
import type { HttpMetadataProviderClients } from "../metadata-provider-clients";
import type { OpenLibraryVolumeEdition, OpenLibraryVolumeWork } from "../providers/open-library-client";
import { uniqueSerialCoverSources } from "./metadata-candidates";

type CatalogClients = Pick<HttpMetadataProviderClients, "bangumi" | "openlibrary">;

class CatalogCache<T> {
  private readonly entries = new Map<string, { expires: number; pending: Promise<T[]> }>();
  async get(key: string, fetch: () => Promise<T[]>): Promise<T[]> {
    const old = this.entries.get(key);
    if (old && old.expires > Date.now()) return old.pending;
    const entry = { expires: Number.POSITIVE_INFINITY, pending: Promise.resolve<T[]>([]) };
    entry.pending = Promise.resolve().then(fetch).then(values => {
      entry.expires = Date.now() + (values.length ? 30 * 60_000 : 2 * 60_000);
      return values;
    }).catch((error: unknown) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    if (this.entries.size > 64) {
      for (const first of this.entries.keys()) {
        this.entries.delete(first);
        break;
      }
    }
    return entry.pending;
  }
}

function aliasesOf(request: VolumeCatalogRequest): string[] {
  return [...new Set([request.originalTitle, ...request.aliases].map(title => title.trim()).filter(Boolean))];
}

function exactSeries(result: ExternalMediaResult, mediaType: "novel" | "manga", aliases: readonly string[]): boolean {
  const keys = new Set(aliases.map(seriesIdentity));
  return result.platforms.some(platform => bangumiBookMediaType(platform) === mediaType)
    && [result.originalTitle, result.title, ...(result.searchTitles ?? [])].some(title => keys.has(seriesIdentity(title)));
}

function relationCandidate(result: ExternalMediaResult): SerialCoverCandidate {
  return {
    provider: "Bangumi", sourceId: result.sourceId, title: result.originalTitle || result.title,
    coverUrl: result.coverUrl, infoUrl: result.sourceUrl, mediaTypeHint: result.mediaType === "novel" ? "novel" : "manga",
  };
}

function editionCandidate(edition: OpenLibraryVolumeEdition): SerialCoverCandidate {
  return {
    provider: "Open Library", sourceId: edition.editionId,
    title: edition.title || edition.workTitle, coverUrl: edition.coverUrl,
    infoUrl: `https://openlibrary.org/books/${edition.editionId}`,
  };
}

export class SerialVolumeCatalogService {
  private readonly bangumiCache = new CatalogCache<ExternalMediaResult>();
  private readonly editionCache = new CatalogCache<OpenLibraryVolumeWork>();
  private readonly workEditionCache = new CatalogCache<OpenLibraryVolumeEdition>();

  constructor(private readonly settings: () => ProviderSettings, private readonly clients: CatalogClients) {}

  private async bangumiVolumes(request: VolumeCatalogRequest, aliases: readonly string[]): Promise<ExternalMediaResult[]> {
    const ids = [...new Set(request.sources.filter(source => source.provider.toLowerCase() === "bangumi").map(source => source.sourceId))];
    return this.bangumiCache.get(JSON.stringify([request.mediaType, aliases, ids]), async () => {
      for (const id of ids) {
        const parent = await this.clients.bangumi.fetchById(request.mediaType, id);
        if (!parent || !exactSeries(parent, request.mediaType, aliases)) continue;
        const volumes = await this.clients.bangumi.fetchBookVolumes(request.mediaType, id);
        if (volumes.length) return volumes;
      }
      for (const title of aliases.slice(0, 2)) {
        const page = await this.clients.bangumi.searchPage(request.mediaType, title, 1);
        const parents = page.results.filter(result => exactSeries(result, request.mediaType, aliases));
        if (parents.length !== 1) continue;
        const volumes = await this.clients.bangumi.fetchBookVolumes(request.mediaType, parents[0].sourceId);
        if (volumes.length) return volumes;
      }
      return [];
    });
  }

  private async openLibraryEditions(request: VolumeCatalogRequest, aliases: readonly string[]): Promise<SerialCoverCandidate[]> {
    const candidates: SerialCoverCandidate[] = [];
    const errors: unknown[] = [];
    const manualAliases = [...new Set([request.queryTitle, ...aliases])];
    const volumeMatches = (edition: OpenLibraryVolumeEdition): boolean =>
      matchesCatalogVolume(edition.title, manualAliases, request.label) || matchesCatalogVolume(edition.workTitle, manualAliases, request.label);
    const collectWork = async (id: string, title: string): Promise<void> => {
      try {
        const editions = await this.workEditionCache.get(id, () => this.clients.openlibrary.fetchWorkEditions(id, title));
        candidates.push(...editions.filter(volumeMatches).map(editionCandidate));
      } catch (error: unknown) { errors.push(error); }
    };
    // A stored Work ID is a direct lookup, even if its cover or search index is incomplete.
    for (const id of [...new Set(request.sources.filter(source => source.provider.toLowerCase() === "openlibrary").map(source => source.sourceId))].slice(0, 2)) {
      await collectWork(id, request.originalTitle);
    }
    if (candidates.length) return uniqueSerialCoverSources(candidates);
    const titles = [...new Set([request.queryTitle, ...aliases])].filter(Boolean).slice(0, 3);
    if (titles[0]) titles.push(`${titles[0]} ${request.label}`);
    for (const title of titles) {
      let works: OpenLibraryVolumeWork[];
      try {
        works = await this.editionCache.get(title, async () => {
          const first = await this.clients.openlibrary.searchBookEditions(title);
          if (!first.hasMore) return first.works;
          try { return [...first.works, ...(await this.clients.openlibrary.searchBookEditions(title, 2)).works]; }
          catch (error: unknown) { errors.push(error); return first.works; }
        });
      } catch (error: unknown) { errors.push(error); break; }
      const matched = works.filter(work => matchesCatalogVolume(work.title, manualAliases, request.label)
        || work.editions.some(volumeMatches));
      candidates.push(...matched.flatMap(work => work.editions.filter(volumeMatches)).map(editionCandidate));
      // Work-level search may have no indexed cover at all; expand exact work IDs
      // before concluding that editions do not exist.
      for (const work of matched.slice(0, 2)) await collectWork(work.id, work.title);
      if (candidates.length) break;
    }
    if (!candidates.length && errors.length) throw errors[0];
    return uniqueSerialCoverSources(candidates);
  }

  async search(request: VolumeCatalogRequest): Promise<VolumeCatalogResult> {
    const settings = this.settings();
    const aliases = aliasesOf(request);
    const warnings: string[] = [];
    const verified: SerialCoverCandidate[] = [];
    const alternatives: SerialCoverCandidate[] = [];
    if (!aliases.length) return { verified, alternatives, warnings };
    if (settings.bangumi) {
      try {
        const volumes = await this.bangumiVolumes(request, aliases);
        verified.push(...uniqueSerialCoverSources(volumes.filter(result => result.coverUrl
          && matchesCatalogVolume(result.originalTitle || result.title, aliases, request.label)).map(relationCandidate)));
      } catch (error) { warnings.push(`Bangumi: ${String(error)}`); }
    }
    // Edition type is not established by an Open Library title or work key alone.
    // Keep these available for manual review, never silently assign manga/novel.
    if (settings.openlibrary && request.manual) {
      try { alternatives.push(...await this.openLibraryEditions(request, aliases)); }
      catch (error) { warnings.push(`Open Library: ${String(error)}`); }
    }
    return { verified, alternatives, warnings };
  }
}

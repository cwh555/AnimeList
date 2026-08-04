import type { ExternalMediaResult, MediaType } from "../domain/media-types";
import type { ProviderSettings } from "../domain/settings-types";

export type MetadataProviderId = keyof ProviderSettings;

export interface MetadataProviderPage {
  results: ExternalMediaResult[];
  hasMore: boolean;
}

export interface MetadataProviderClient {
  readonly id: MetadataProviderId;
  readonly label: string;
  readonly supportsChineseDiscovery?: boolean;
  supports(mediaType: MediaType): boolean;
  searchPage(mediaType: MediaType, query: string, page: number): Promise<MetadataProviderPage>;
  searchPages?(mediaType: MediaType, queries: string[], page: number): Promise<MetadataProviderPage[]>;
}

export interface MetadataProviderClients {
  bangumi: MetadataProviderClient;
  anilist: MetadataProviderClient;
  openlibrary: MetadataProviderClient;
}

export function enabledMetadataProviders(
  settings: ProviderSettings,
  mediaType: MediaType,
  clients: MetadataProviderClients,
): MetadataProviderClient[] {
  const ordered: MetadataProviderClient[] = [clients.bangumi, clients.anilist, clients.openlibrary];
  return ordered.filter((client) => settings[client.id] && client.supports(mediaType));
}

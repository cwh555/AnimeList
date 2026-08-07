import type { MetadataProviderClients } from "./external-media-provider";
import { AniListClient } from "./providers/anilist-client";
import { BangumiClient } from "./providers/bangumi-client";
import { OpenLibraryClient } from "./providers/open-library-client";

export interface HttpMetadataProviderClients extends MetadataProviderClients {
  bangumi: BangumiClient;
  anilist: AniListClient;
  openlibrary: OpenLibraryClient;
}

export function createMetadataProviderClients(): HttpMetadataProviderClients {
  return {
    bangumi: new BangumiClient(),
    anilist: new AniListClient(),
    openlibrary: new OpenLibraryClient(),
  };
}

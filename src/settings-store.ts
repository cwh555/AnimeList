import type { AnimeListSettings } from "./domain/settings-types";
import { normalizeAnimeListSettings } from "./settings-model";

export interface SettingsStorage {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

export class AnimeListSettingsStore {
  constructor(private readonly storage: SettingsStorage) {}

  async load(): Promise<AnimeListSettings> {
    return normalizeAnimeListSettings(await this.storage.loadData());
  }

  async save(settings: AnimeListSettings): Promise<AnimeListSettings> {
    const normalized = normalizeAnimeListSettings(settings);
    await this.storage.saveData(normalized);
    return normalized;
  }
}

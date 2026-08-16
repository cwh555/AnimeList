import type { MediaItem } from "../types";

export type MasterpieceDecorationFactory = () => MediaItem;

export class MasterpieceDecorationCache {
  private readonly byHost = new WeakMap<object, WeakMap<MediaItem, MediaItem>>();

  getOrCreate(host: object, item: MediaItem, factory: MasterpieceDecorationFactory): MediaItem {
    let items = this.byHost.get(host);
    if (!items) {
      items = new WeakMap<MediaItem, MediaItem>();
      this.byHost.set(host, items);
    }
    const cached = items.get(item);
    if (cached) return cached;
    const decorated = factory();
    items.set(item, decorated);
    return decorated;
  }
}

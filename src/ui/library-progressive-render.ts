export const LIBRARY_CARD_BATCH_SIZE = 24;

export interface LibraryRenderBatch {
  start: number;
  end: number;
  done: boolean;
}

export class ProgressiveRenderWindow {
  private visible = 0;

  constructor(
    private total: number,
    private readonly batchSize = LIBRARY_CARD_BATCH_SIZE,
  ) {
    this.total = Math.max(0, Math.floor(total));
  }

  reset(total = this.total): LibraryRenderBatch {
    this.total = Math.max(0, Math.floor(total));
    this.visible = 0;
    return this.next();
  }

  next(): LibraryRenderBatch {
    const start = this.visible;
    this.visible = Math.min(this.total, this.visible + Math.max(1, Math.floor(this.batchSize)));
    return { start, end: this.visible, done: this.visible >= this.total };
  }
}

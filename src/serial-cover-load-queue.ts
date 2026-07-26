export class SerialCoverLoadQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const normalizedKey = key.normalize("NFKC").trim();
    if (!normalizedKey) return Promise.reject(new Error("Serial cover queue key is required."));

    const existing = this.pending.get(normalizedKey);
    if (existing) return existing as Promise<T>;

    const run = this.tail.then(operation);
    this.tail = run.then(() => undefined, () => undefined);

    let tracked!: Promise<T>;
    tracked = run.finally(() => {
      if (this.pending.get(normalizedKey) === tracked) this.pending.delete(normalizedKey);
    });
    this.pending.set(normalizedKey, tracked);
    return tracked;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  async whenIdle(): Promise<void> {
    await this.tail;
  }
}

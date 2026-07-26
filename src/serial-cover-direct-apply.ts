import type { RankedSerialCoverCandidate } from "./serial-entry-cover";

export class SerialCoverDirectApply {
  private activeSource: string | null = null;

  get activeSourceId(): string | null {
    return this.activeSource;
  }

  get isApplying(): boolean {
    return this.activeSource !== null;
  }

  async run<T>(
    candidate: RankedSerialCoverCandidate,
    loader: (candidate: RankedSerialCoverCandidate) => Promise<T>,
  ): Promise<T | undefined> {
    if (this.activeSource !== null) return undefined;
    this.activeSource = candidate.sourceId;
    try {
      return await loader(candidate);
    } finally {
      this.activeSource = null;
    }
  }
}

export async function directlyApplySerialCover<T>(
  action: SerialCoverDirectApply,
  candidate: RankedSerialCoverCandidate,
  loader: (candidate: RankedSerialCoverCandidate) => Promise<T>,
  onApplied: (value: T) => void,
  close: () => void,
): Promise<boolean> {
  const value = await action.run(candidate, loader);
  if (value === undefined) return false;
  onApplied(value);
  close();
  return true;
}

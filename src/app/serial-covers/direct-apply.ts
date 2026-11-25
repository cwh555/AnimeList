import type { RankedSerialCoverCandidate } from "../../domain/serial-covers/ranking";

export class SerialCoverDirectApply {
  private activeSource: string | null = null;
  private activeKey: string | null = null;

  get activeSourceId(): string | null {
    return this.activeSource;
  }

  get activeSourceKey(): string | null {
    return this.activeKey;
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
    this.activeKey = JSON.stringify([candidate.provider, candidate.sourceId]);
    try {
      return await loader(candidate);
    } finally {
      this.activeSource = null;
      this.activeKey = null;
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

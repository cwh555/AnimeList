import type { RankedSerialCoverCandidate } from "./serial-entry-cover";

export class SerialCoverSelection {
  private selected: RankedSerialCoverCandidate | null;
  private applying = false;

  constructor(candidates: RankedSerialCoverCandidate[]) {
    this.selected = candidates[0] ?? null;
  }

  get selectedCandidate(): RankedSerialCoverCandidate | null {
    return this.selected;
  }

  get isApplying(): boolean {
    return this.applying;
  }

  get canApply(): boolean {
    return this.selected !== null && !this.applying;
  }

  replace(candidates: RankedSerialCoverCandidate[]): void {
    if (!this.applying) this.selected = candidates[0] ?? null;
  }

  select(candidate: RankedSerialCoverCandidate): void {
    if (!this.applying) this.selected = candidate;
  }

  async apply<T>(loader: (candidate: RankedSerialCoverCandidate) => Promise<T>): Promise<T | null> {
    const candidate = this.selected;
    if (!candidate || this.applying) return null;
    this.applying = true;
    try {
      return await loader(candidate);
    } finally {
      this.applying = false;
    }
  }
}

export interface SerialCoverTicket {
  readonly label: string;
  readonly revision: number;
}

/** A manual choice or clear supersedes an older automatic request. */
export class SerialCoverIntent {
  private closed = false;
  private readonly revisions = new Map<string, number>();

  capture(label: string): SerialCoverTicket {
    return { label, revision: this.revisions.get(label) ?? 0 };
  }

  isCurrent(ticket: SerialCoverTicket): boolean {
    return !this.closed && (this.revisions.get(ticket.label) ?? 0) === ticket.revision;
  }

  invalidate(label: string): void {
    this.revisions.set(label, (this.revisions.get(label) ?? 0) + 1);
  }

  close(): void {
    this.closed = true;
    this.revisions.clear();
  }
}

import type { ExternalMediaResult, MediaType } from "../domain/media-types";

export interface SearchModalAdapter {
  readonly contentEl: HTMLElement;
  results: ExternalMediaResult[];
  warnings: string[];
  query: string;
  mediaType: MediaType;
  renderSearch(): void;
  search(button: HTMLButtonElement): Promise<void>;
  createResultRow(result: ExternalMediaResult): HTMLElement;
}

export interface SearchRenderContext<Host> {
  host: Host;
  modal: SearchModalAdapter;
}

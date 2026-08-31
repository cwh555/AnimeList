import type { TFile } from "obsidian";
import type { TagChipControl } from "./tag-chip-control";
import type {
  ExternalMediaResult,
  MediaNoteForm,
  MediaType,
} from "../domain/media-types";

export type MediaFormMode = "create" | "edit";

export type MediaFormDateControl = HTMLDivElement & {
  value: string;
  required: boolean;
};

export interface MediaFormFields {
  title: HTMLInputElement;
  status: HTMLSelectElement;
  releaseStatus: HTMLSelectElement | null;
  score: HTMLInputElement;
  startedAt: MediaFormDateControl;
  completedAt: MediaFormDateControl;
  progress: HTMLInputElement;
  total: HTMLInputElement | null;
  unit: HTMLSelectElement;
  genres: TagChipControl;
  template: HTMLSelectElement | null;
  favorite: HTMLInputElement;
}

export interface MediaFormHost {
  app: {
    vault: {
      getAbstractFileByPath(path: string): unknown;
    };
    metadataCache: {
      getFileCache(file: unknown): { frontmatter?: Record<string, unknown> } | null;
    };
  };
}

export interface MediaFormContext<Host extends MediaFormHost> {
  mode: MediaFormMode;
  host: Host;
  modalEl: HTMLElement;
  formEl: HTMLElement;
  mediaType: MediaType;
  result: ExternalMediaResult | null;
  file: TFile | null;
  frontmatter: Record<string, unknown>;
  fields: MediaFormFields;
  state: Map<string, unknown>;
  onDispose(disposer: () => void): () => void;
  dispose(): void;
}

export interface MediaFormSubmitContext<Host extends MediaFormHost>
  extends MediaFormContext<Host> {
  form: MediaNoteForm;
}

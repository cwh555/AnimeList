import type { LibrarySection } from "../domain/settings-types";

export interface WorkspacePageRenderContext {
  /** Workspace-owned slot for page-local actions. Pages reconcile this slot directly. */
  pageActions: HTMLElement;
  /** True only when the currently mounted destination is being refreshed in place. */
  samePageRefresh: boolean;
  /** Aborted as soon as a newer render is requested or the view closes. */
  signal: AbortSignal;
}

export interface WorkspacePageDefinition {
  id: LibrarySection;
  label: string;
  icon: string;
  order: number;
  render(container: HTMLElement, context: WorkspacePageRenderContext): void | Promise<void>;
}

export interface WorkspaceMenuAction {
  id: string;
  label: string;
  icon?: string;
  order: number;
  run(): void | Promise<void>;
}

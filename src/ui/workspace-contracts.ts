import type { LibrarySection } from "../domain/settings-types";

export interface WorkspacePageDefinition {
  id: LibrarySection;
  label: string;
  icon: string;
  order: number;
  render(container: HTMLElement): void | Promise<void>;
}

export interface WorkspaceMenuAction {
  id: string;
  label: string;
  icon?: string;
  order: number;
  run(): void | Promise<void>;
}

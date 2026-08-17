import type { LibrarySection } from "../domain/settings-types";

export interface LibraryNavigationAdapter<Leaf> {
  findLeaves(): Leaf[];
  createLeaf(): Leaf;
  activateLeaf(leaf: Leaf): Promise<void>;
  revealLeaf(leaf: Leaf): void;
  showLibrary(leaf: Leaf): Promise<void>;
  showSection?(leaf: Leaf, section: LibrarySection): Promise<void>;
  initializeLibrary(): Promise<void>;
  reportOpenFailure(error: unknown): void;
  reportSetupFailure(error: unknown): void;
}

async function openOnce<Leaf>(adapter: LibraryNavigationAdapter<Leaf>, section: LibrarySection): Promise<void> {
  let leaf = adapter.findLeaves()[0];
  if (!leaf) {
    leaf = adapter.createLeaf();
    await adapter.activateLeaf(leaf);
  }
  adapter.revealLeaf(leaf);
  if (adapter.showSection) await adapter.showSection(leaf, section);
  else await adapter.showLibrary(leaf);
  try {
    await adapter.initializeLibrary();
  } catch (error) {
    adapter.reportSetupFailure(error);
  }
}

export function createReliableLibraryOpener<Leaf>(
  adapter: LibraryNavigationAdapter<Leaf>,
): (section?: LibrarySection) => Promise<void> {
  let pending: Promise<void> | null = null;
  return async (section: LibrarySection = "library"): Promise<void> => {
    if (pending !== null) return pending;
    pending = openOnce(adapter, section)
      .catch((error: unknown) => { adapter.reportOpenFailure(error); })
      .finally(() => { pending = null; });
    return pending;
  };
}

export const WORKSPACE_COMPACT_BREAKPOINT = 600;
export const WORKSPACE_EXPANDED_BREAKPOINT = 840;

export type WorkspaceWindowSize = "compact" | "medium" | "expanded";

const activeResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

export function classifyWorkspaceWidth(width: number): WorkspaceWindowSize {
  const normalizedWidth = Number.isFinite(width) && width >= 0
    ? width
    : WORKSPACE_EXPANDED_BREAKPOINT;
  if (normalizedWidth < WORKSPACE_COMPACT_BREAKPOINT) return "compact";
  if (normalizedWidth < WORKSPACE_EXPANDED_BREAKPOINT) return "medium";
  return "expanded";
}

function measuredWorkspaceWidth(shell: HTMLElement): number {
  const measured = typeof shell.getBoundingClientRect === "function"
    ? shell.getBoundingClientRect().width
    : 0;
  return measured || shell.clientWidth || WORKSPACE_EXPANDED_BREAKPOINT;
}

export function syncWorkspaceWindowSize(shell: HTMLElement): WorkspaceWindowSize {
  const size = classifyWorkspaceWidth(measuredWorkspaceWidth(shell));
  shell.dataset.windowSize = size;
  return size;
}

export function disconnectWorkspaceWindowSize(container: HTMLElement): void {
  activeResizeObservers.get(container)?.disconnect();
  activeResizeObservers.delete(container);
}

export function observeWorkspaceWindowSize(container: HTMLElement, shell: HTMLElement): void {
  disconnectWorkspaceWindowSize(container);
  syncWorkspaceWindowSize(shell);
  if (typeof ResizeObserver !== "function") return;
  const observer = new ResizeObserver(() => syncWorkspaceWindowSize(shell));
  observer.observe(shell);
  activeResizeObservers.set(container, observer);
}

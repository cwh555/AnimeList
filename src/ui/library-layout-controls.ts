import {
  MAX_LIBRARY_LAYOUT_COLUMNS,
  MIN_LIBRARY_LAYOUT_COLUMNS,
  libraryColumnsForView,
  libraryLayoutColumnsWithView,
  normalizeLibraryLayoutColumns,
  type LibraryLayoutColumns,
} from "../domain/library-layout";
import type { LibraryUiState } from "../domain/settings-types";
import { libraryLayoutText } from "../features/library-layout/text";
import { makeEl } from "./ui-helpers";

export interface LibraryLayoutControl {
  sync(state: LibraryUiState): void;
}

export interface LibraryLayoutControlOptions {
  initialState: LibraryUiState;
  onColumnsChange(columns: LibraryLayoutColumns): void;
}

export function installLibraryLayoutControl(
  container: HTMLElement,
  options: LibraryLayoutControlOptions,
): LibraryLayoutControl | null {
  const views = container.querySelector<HTMLElement>(".al-toolbar .al-view-switch");
  const grid = container.querySelector<HTMLElement>(".al-grid");
  if (!views || !grid) return null;
  const workspaceOwnedLayout = container.closest(".al-workspace-shell") !== null;

  const control = makeEl("label", "al-library-column-control");
  control.setCssStyles({
    display: "flex",
    flex: "1 1 0",
    minWidth: "0",
    alignItems: "center",
    gap: "6px",
    padding: "0 8px",
    borderRight: "1px solid var(--al-border)",
  });
  const labelText = makeEl("span", "al-library-column-label", libraryLayoutText("columnsLabel"));
  labelText.setCssStyles({
    flex: "0 0 auto",
    color: "var(--text-muted)",
    fontSize: ".65rem",
    fontWeight: "650",
    whiteSpace: "nowrap",
  });
  const range = makeEl("input");
  range.type = "range";
  range.min = String(MIN_LIBRARY_LAYOUT_COLUMNS);
  range.max = String(MAX_LIBRARY_LAYOUT_COLUMNS);
  range.step = "1";
  range.setAttribute("aria-label", libraryLayoutText("columnsLabel"));
  range.setCssStyles({
    flex: "1 1 72px",
    width: "78px",
    minWidth: "54px",
    margin: "0",
  });
  const value = makeEl("output", "al-library-column-value");
  value.setCssStyles({
    flex: "0 0 1.5em",
    color: "var(--text-normal)",
    fontSize: ".7rem",
    fontWeight: "720",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
  });
  views.setCssStyles({ width: "min(100%, 320px)", maxWidth: "100%" });
  let state = options.initialState;

  const sync = (nextState: LibraryUiState): void => {
    state = nextState;
    const normalized = normalizeLibraryLayoutColumns(nextState.layoutColumns);
    const columns = libraryColumnsForView(normalized, nextState.view);
    control.hidden = columns === null;
    if (columns === null) {
      grid.style.removeProperty("grid-template-columns");
      grid.style.removeProperty("--al-library-preferred-columns");
      delete grid.dataset.layoutColumns;
      return;
    }
    if (workspaceOwnedLayout) {
      grid.style.removeProperty("grid-template-columns");
      grid.style.setProperty("--al-library-preferred-columns", String(columns));
      grid.dataset.layoutColumns = String(columns);
    } else {
      grid.style.removeProperty("--al-library-preferred-columns");
      delete grid.dataset.layoutColumns;
      grid.style.setProperty("grid-template-columns", `repeat(${columns}, minmax(0, 1fr))`);
    }
    range.value = String(columns);
    value.value = String(columns);
    value.textContent = String(columns);
  };

  range.addEventListener("input", () => {
    if (state.view === "list") return;
    const columns = libraryLayoutColumnsWithView(
      normalizeLibraryLayoutColumns(state.layoutColumns),
      state.view,
      range.value,
    );
    state = { ...state, layoutColumns: columns };
    sync(state);
    options.onColumnsChange(columns);
  });

  control.append(labelText, range, value);
  views.prepend(control);
  sync(options.initialState);

  return { sync };
}

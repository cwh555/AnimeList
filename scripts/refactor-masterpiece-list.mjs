import fs from "node:fs";

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing expected block in ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace(
  "src/legacy.ts",
  "  const statusMatch = (item, filter) => mediaStatusMatches(item.status, filter);",
  `  const statusMatch = (item, filter, adapters) => {
    const customMatch = adapters.matchesStatusFilter?.(item, filter);
    return typeof customMatch === "boolean"
      ? customMatch
      : mediaStatusMatches(item.status, filter);
  };`,
);

replace(
  "src/legacy.ts",
  `    const initialState = adapters.initialState || {};
    const initialView = ["grid", "list", "poster"].includes(initialState.view || adapters.initialView) ? (initialState.view || adapters.initialView) : "grid";
    const state = {
      type: ["all", "anime", "manga", "novel"].includes(initialState.type) ? initialState.type : "all",
      status: normalizeStatusFilter(initialState.status),`,
  `    const initialState = adapters.initialState || {};
    const initialView = ["grid", "list", "poster"].includes(initialState.view || adapters.initialView) ? (initialState.view || adapters.initialView) : "grid";
    const initialType = ["all", "anime", "manga", "novel"].includes(initialState.type) ? initialState.type : "all";
    const statusOptions = (type) => [
      ...statusFilterOptions(type),
      ...asArray(adapters.extraStatusFilters?.(type)),
    ];
    const initialStatus = String(initialState.status || "");
    const initialStatusKeys = new Set(statusOptions(initialType).map(([key]) => key));
    const state = {
      type: initialType,
      status: initialStatusKeys.has(initialStatus) ? initialStatus : normalizeStatusFilter(initialStatus),`,
);

replace(
  "src/legacy.ts",
  "      statusFilterOptions(state.type).forEach(([key, label]) => {",
  "      statusOptions(state.type).forEach(([key, label]) => {",
);

replace(
  "src/legacy.ts",
  "        if (!statusMatch(item, state.status)) return false;",
  "        if (!statusMatch(item, state.status, adapters)) return false;",
);

const labelsPath = "src/masterpiece-labels.ts";
let labels = fs.readFileSync(labelsPath, "utf8");
labels = labels.replace(
  `export function filterBySpecialLabel<T>(
  items: readonly T[],
  active: boolean,
): T[] {
  if (!active) return [...items];
  return items.filter((item) => (
    typeof item === "object"
    && item !== null
    && Reflect.get(item, "favorite") === true
  ));
}

export function resolveSpecialListState<T extends { status?: string }>(
  currentState: T | undefined,
  initialState: T | undefined,
  active: boolean,
): T | undefined {
  const state = currentState ?? initialState;
  if (!state || !active) return state;
  return { ...state, status: "all" };
}
`,
  `export const SPECIAL_LABEL_FILTER = "favorite" as const;

export function matchesSpecialLabelFilter(
  item: unknown,
  filter: unknown,
): boolean | undefined {
  if (filter !== SPECIAL_LABEL_FILTER) return undefined;
  return typeof item === "object"
    && item !== null
    && Reflect.get(item, "favorite") === true;
}
`,
);
fs.writeFileSync(labelsPath, labels);

const uiPath = "src/masterpiece-ui.ts";
let ui = fs.readFileSync(uiPath, "utf8");
ui = ui
  .replace("  filterBySpecialLabel,\n", "")
  .replace("  resolveSpecialListState,\n", "")
  .replace("  renameMasterpieceLabel,\n", "  matchesSpecialLabelFilter,\n  renameMasterpieceLabel,\n")
  .replace(/interface LibraryRenderState \{[\s\S]*?\}\n\n/, "")
  .replace("const activeFilters = new WeakMap<HTMLElement, boolean>();\n", "")
  .replace("const libraryStates = new WeakMap<HTMLElement, LibraryRenderState>();\n", "");

const rendererStart = ui.indexOf("function installRenderer(plugin: MasterpiecePlugin): void {");
const rendererEnd = ui.indexOf("\nexport async function installMasterpieceLabels", rendererStart);
if (rendererStart < 0 || rendererEnd < 0) throw new Error("Could not locate installRenderer");
const renderer = `function installRenderer(plugin: MasterpiecePlugin): void {
  if (installedRenderers.has(AnimeListUI)) return;
  installedRenderers.add(AnimeListUI);
  const original = AnimeListUI.renderLibrary.bind(AnimeListUI);

  AnimeListUI.renderLibrary = (container, inputItems, adapters = {}): void => {
    const upstreamExtraFilters = Reflect.get(adapters, "extraStatusFilters");
    const upstreamMatcher = Reflect.get(adapters, "matchesStatusFilter");
    const forwardedAdapters = {
      ...adapters,
      extraStatusFilters: (type: string): Array<[string, string]> => [
        ...(typeof upstreamExtraFilters === "function" ? upstreamExtraFilters(type) : []),
        ["favorite", specialLabelName(modeOf(plugin))],
      ],
      matchesStatusFilter: (item: unknown, filter: string): boolean | undefined => {
        const specialMatch = matchesSpecialLabelFilter(item, filter);
        if (typeof specialMatch === "boolean") return specialMatch;
        return typeof upstreamMatcher === "function"
          ? upstreamMatcher(item, filter)
          : undefined;
      },
    };
    original(container, inputItems, forwardedAdapters);

    const items = inputItems.filter(isMediaItem);
    const byPath = new Map(items.map((item) => [item.filePath, item]));
    const cards = container.querySelectorAll(".al-card") as NodeListOf<HTMLElement>;
    cards.forEach((card) => {
      const path = card.dataset.path ?? card.getAttribute("data-path") ?? "";
      const item = byPath.get(path) ?? items.find((candidate) => (
        candidate.title === card.querySelector(".al-card-title")?.textContent
      ));
      if (!item) return;
      const favoriteButton = card.querySelector<HTMLElement>(".al-favorite-button");
      if (favoriteButton && modeOf(plugin) === "masterpiece") {
        favoriteButton.title = item.favorite
          ? masterpieceFeatureText("library.editMasterpiece")
          : masterpieceFeatureText("library.addMasterpiece");
        favoriteButton.setAttribute("aria-label", favoriteButton.title);
      }
      if (modeOf(plugin) !== "masterpiece" || !item.favorite) return;
      const labels = labelsForMasterpieceEnable(labelsOf(item));
      let tags = card.querySelector<HTMLElement>(".al-tags");
      if (!tags) {
        tags = card.createDiv({ cls: "al-tags" });
        card.querySelector(".al-progress")?.before(tags);
      }
      for (const label of labels) {
        tags.createSpan({ cls: "al-tag al-masterpiece-tag", text: label });
      }
    });
  };
}
`;
ui = ui.slice(0, rendererStart) + renderer + ui.slice(rendererEnd);
fs.writeFileSync(uiPath, ui);

const testPath = "tests/masterpiece-labels.test.ts";
let test = fs.readFileSync(testPath, "utf8");
test = test
  .replace("  filterBySpecialLabel,\n", "")
  .replace("  resolveSpecialListState,\n", "")
  .replace("  renameMasterpieceLabel,\n", "  matchesSpecialLabelFilter,\n  renameMasterpieceLabel,\n");
test = test.replace(
  /  it\("treats favorite as a mutually exclusive peer list"[\s\S]*?\n  \}\);\n\n/,
  `  it("matches the favorite list through the shared status-filter extension", () => {
    assert.equal(matchesSpecialLabelFilter({ favorite: true }, "favorite"), true);
    assert.equal(matchesSpecialLabelFilter({ favorite: false }, "favorite"), false);
    assert.equal(matchesSpecialLabelFilter({ favorite: true }, "completed"), undefined);
  });

`,
);
fs.writeFileSync(testPath, test);

fs.writeFileSync(
  ".github/workflows/ci.yml",
  `name: CI

on:
  push:
    branches: [main, preview]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run release:check
`,
);
fs.rmSync("scripts/refactor-masterpiece-list.mjs");

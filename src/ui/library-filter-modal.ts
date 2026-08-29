import { App, Modal } from "obsidian";
import type { LibraryFilterOptions, LibraryFilters, LibraryQuarterOption } from "../domain/library-filters";
import { normalizeLibraryFilters, toggleLibraryFilterValue, toggleLibraryQuarter } from "../domain/library-filters";
import { localizeProviderTag } from "../i18n/provider-tag-localization";
import { uiText } from "../ui-text";
import { mediaQuarterLabel } from "./media-quarter-label";
import { makeEl, setAnimeListIcon } from "./ui-helpers";

export type ApplyLibraryFilters = (filters: LibraryFilters) => void;

function filterText(value: string, query: string): boolean {
  if (!query) return true;
  const normalizedQuery = query.toLocaleLowerCase();
  return value.toLocaleLowerCase().includes(normalizedQuery)
    || localizeProviderTag(value).toLocaleLowerCase().includes(normalizedQuery);
}

export class LibraryFilterModal extends Modal {
  private draft: LibraryFilters;
  private query = "";
  private groupsEl?: HTMLElement;

  constructor(
    app: App,
    filters: LibraryFilters,
    private readonly options: LibraryFilterOptions,
    private readonly onApply: ApplyLibraryFilters,
  ) {
    super(app);
    this.draft = normalizeLibraryFilters(filters);
  }

  onOpen(): void {
    this.modalEl.classList.add("animelist-modal", "animelist-library-filter-modal");
    this.contentEl.replaceChildren();

    const heading = makeEl("div", "al-modal-heading");
    heading.append(
      makeEl("h2", "", uiText("library.filterTitle")),
      makeEl("p", "", uiText("library.filterDescription")),
    );
    this.contentEl.appendChild(heading);

    const search = makeEl("label", "al-filter-search");
    const icon = makeEl("span", "al-icon");
    setAnimeListIcon(icon, "search");
    const input = makeEl("input");
    input.type = "search";
    input.placeholder = uiText("library.filterSearchPlaceholder");
    input.addEventListener("input", () => {
      this.query = input.value.trim().toLocaleLowerCase();
      this.renderGroups();
    });
    search.append(icon, input);
    this.contentEl.appendChild(search);

    this.groupsEl = makeEl("div", "al-filter-groups");
    this.contentEl.appendChild(this.groupsEl);
    this.renderGroups();

    const actions = makeEl("div", "al-modal-actions al-filter-actions");
    const clear = makeEl("button", "al-filter-clear", uiText("library.filterClear"));
    clear.type = "button";
    clear.addEventListener("click", () => {
      const empty = normalizeLibraryFilters({});
      this.draft = empty;
      this.onApply(empty);
      this.close();
    });
    const spacer = makeEl("span", "al-filter-action-spacer");
    const cancel = makeEl("button", "", uiText("action.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const apply = makeEl("button", "mod-cta", uiText("library.filterApply"));
    apply.type = "button";
    apply.addEventListener("click", () => {
      this.onApply(normalizeLibraryFilters(this.draft));
      this.close();
    });
    actions.append(clear, spacer, cancel, apply);
    this.contentEl.appendChild(actions);

    window.setTimeout(() => input.focus(), 0);
  }

  private renderGroups(): void {
    if (!this.groupsEl) return;
    this.groupsEl.replaceChildren();
    this.renderStringGroup(
      uiText("library.filterCompanies"),
      this.options.companies,
      this.draft.companies,
      (value) => {
        this.draft.companies = toggleLibraryFilterValue(this.draft.companies, value);
      },
    );
    this.renderQuarterGroup(this.options.quarters);
    this.renderStringGroup(
      uiText("library.filterTags"),
      this.options.tags,
      this.draft.tags,
      (value) => {
        this.draft.tags = toggleLibraryFilterValue(this.draft.tags, value);
      },
    );
  }

  private renderStringGroup(
    label: string,
    options: readonly string[],
    selected: readonly string[],
    toggle: (value: string) => void,
  ): void {
    const visible = options.filter((option) => filterText(option, this.query));
    const section = this.createGroup(label);
    if (!visible.length) {
      section.appendChild(makeEl("div", "al-filter-empty", uiText("library.filterNoMatches")));
      this.groupsEl?.appendChild(section);
      return;
    }
    const chips = makeEl("div", "al-filter-chips");
    for (const option of visible) {
      chips.appendChild(this.createChip(localizeProviderTag(option), selected.includes(option), () => {
        toggle(option);
        this.renderGroups();
      }));
    }
    section.appendChild(chips);
    this.groupsEl?.appendChild(section);
  }

  private renderQuarterGroup(options: readonly LibraryQuarterOption[]): void {
    const visible = options.filter((option) => filterText(mediaQuarterLabel(option.season, option.year), this.query));
    const section = this.createGroup(uiText("library.filterQuarter"));
    if (!visible.length) {
      section.appendChild(makeEl("div", "al-filter-empty", uiText("library.filterNoMatches")));
      this.groupsEl?.appendChild(section);
      return;
    }
    const chips = makeEl("div", "al-filter-chips");
    for (const option of visible) {
      const label = mediaQuarterLabel(option.season, option.year);
      chips.appendChild(this.createChip(label, this.draft.quarter === option.key, () => {
        this.draft.quarter = toggleLibraryQuarter(this.draft.quarter, option.key);
        this.renderGroups();
      }));
    }
    section.appendChild(chips);
    this.groupsEl?.appendChild(section);
  }

  private createGroup(label: string): HTMLElement {
    const section = makeEl("section", "al-filter-group");
    section.appendChild(makeEl("h3", "al-filter-group-title", label));
    return section;
  }

  private createChip(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
    const chip = makeEl("button", `al-filter-chip${selected ? " is-selected" : ""}`, label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", selected ? "true" : "false");
    chip.addEventListener("click", onClick);
    return chip;
  }
}

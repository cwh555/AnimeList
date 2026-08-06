import { normalizeUserTag, normalizeUserTags } from "../domain/user-tags";
import { uiText } from "../ui-text";
import { makeEl } from "./ui-helpers";

export interface TagChipControl extends HTMLDivElement {
  values(): string[];
  setValues(values: unknown): void;
}

export interface CreateTagChipControlInput {
  values: unknown;
  suggestions?: readonly string[];
}

export function createTagChipField(
  parent: HTMLElement,
  input: CreateTagChipControlInput,
  hintText = "",
): TagChipControl {
  const wrapper = createDiv();
  wrapper.className = "al-form-field al-form-field-tags";
  wrapper.append(
    makeEl("span", "al-form-label", uiText("add.genres")),
  );
  const control = createTagChipControl(input);
  wrapper.appendChild(control);
  if (hintText) wrapper.appendChild(makeEl("small", "al-form-hint", hintText));
  parent.appendChild(wrapper);
  return control;
}

export function tagSuggestionValues(
  suggestions: readonly string[],
  selected: readonly string[],
  query = "",
): string[] {
  const selectedKeys = new Set(selected.map((value) => value.toLocaleLowerCase()));
  const normalizedQuery = normalizeUserTag(query).toLocaleLowerCase();
  return normalizeUserTags(suggestions)
    .filter((value) => !selectedKeys.has(value.toLocaleLowerCase()))
    .filter((value) => !normalizedQuery || value.toLocaleLowerCase().includes(normalizedQuery));
}

export function appendReadOnlyTagChips(parent: HTMLElement, values: readonly string[]): HTMLElement {
  const set = createDiv();
  set.className = "al-tag-chip-set al-tag-chip-set-readonly";
  set.setAttribute("role", "list");
  for (const value of values) {
    const chip = makeEl("span", "al-tag-chip al-tag-chip-readonly", value);
    chip.setAttribute("role", "listitem");
    set.appendChild(chip);
  }
  parent.appendChild(set);
  return set;
}

export function createTagChipControl({ values, suggestions = [] }: CreateTagChipControlInput): TagChipControl {
  const root = createDiv() as TagChipControl;
  root.className = "al-tag-control";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", uiText("add.genres"));

  const chipSet = createDiv();
  chipSet.className = "al-tag-chip-set";
  const add = createEl("button");
  add.type = "button";
  add.className = "al-tag-add-button";
  add.textContent = "+";
  add.setAttribute("aria-label", uiText("add.tagsAdd"));
  add.title = uiText("add.tagsAdd");
  chipSet.appendChild(add);
  root.appendChild(chipSet);

  const picker = createDiv();
  picker.className = "al-tag-picker";
  picker.hidden = true;
  const input = createEl("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = uiText("add.tagsPlaceholder");
  input.setAttribute("aria-label", uiText("add.tagsPlaceholder"));
  const suggestionsEl = createDiv();
  suggestionsEl.className = "al-tag-suggestions";
  picker.append(input, suggestionsEl);
  root.appendChild(picker);

  let selected = normalizeUserTags(values);

  const emit = (): void => {
    root.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const addValue = (raw: unknown): void => {
    const value = normalizeUserTag(raw);
    if (!value || selected.some((entry) => entry.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    selected = normalizeUserTags([...selected, value]);
    input.value = "";
    render();
    emit();
  };

  const removeValue = (value: string): void => {
    selected = selected.filter((entry) => entry !== value);
    render();
    emit();
  };

  const renderSuggestions = (): void => {
    suggestionsEl.replaceChildren();
    const available = tagSuggestionValues(suggestions, selected, input.value);
    for (const value of available.slice(0, 18)) {
      const suggestion = makeEl("button", "al-tag-suggestion", value);
      suggestion.type = "button";
      suggestion.addEventListener("click", () => addValue(value));
      suggestionsEl.appendChild(suggestion);
    }
    if (!available.length && input.value.trim()) {
      suggestionsEl.appendChild(makeEl("small", "al-tag-picker-hint", uiText("add.tagsCreateHint")));
    }
  };

  const render = (): void => {
    [...chipSet.querySelectorAll(".al-tag-chip-selected")].forEach((chip) => chip.remove());
    for (const value of selected) {
      const chip = createDiv();
      chip.className = "al-tag-chip al-tag-chip-selected";
      chip.appendChild(makeEl("span", "al-tag-chip-label", value));
      const remove = makeEl("button", "al-tag-chip-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", uiText("add.tagsRemove", { tag: value }));
      remove.title = uiText("add.tagsRemove", { tag: value });
      remove.addEventListener("click", () => removeValue(value));
      chip.appendChild(remove);
      chipSet.insertBefore(chip, add);
    }
    renderSuggestions();
  };

  add.addEventListener("click", () => {
    picker.hidden = !picker.hidden;
    add.classList.toggle("is-active", !picker.hidden);
    add.setAttribute("aria-expanded", picker.hidden ? "false" : "true");
    if (!picker.hidden) window.setTimeout(() => input.focus(), 0);
  });
  add.setAttribute("aria-expanded", "false");
  input.addEventListener("input", renderSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addValue(input.value);
    } else if (event.key === "Escape") {
      picker.hidden = true;
      add.classList.remove("is-active");
      add.setAttribute("aria-expanded", "false");
      add.focus();
    }
  });

  root.values = () => [...selected];
  root.setValues = (nextValues: unknown) => {
    selected = normalizeUserTags(nextValues);
    render();
  };
  render();
  return root;
}

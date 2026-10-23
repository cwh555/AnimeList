import { makeEl } from "./ui-helpers";

export type UiActionKind = "primary" | "secondary" | "danger";

/** Shared semantics for standard AnimeList modal actions; feature-specific icon buttons stay independent. */
export function createUiAction(label: string, kind: UiActionKind = "secondary"): HTMLButtonElement {
  const modifier = kind === "primary" ? " mod-cta" : kind === "danger" ? " mod-warning" : "";
  const button = makeEl("button", `al-ui-button al-ui-button-${kind}${modifier}`, label);
  button.type = "button";
  return button;
}

export interface FilePickerControl {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly trigger: HTMLButtonElement;
}

/** A keyboard-accessible button driving a native file input on desktop and mobile. */
export function createFilePickerControl(label: string, accept: string): FilePickerControl {
  const element = makeEl("div", "al-file-picker-control");
  const input = makeEl("input", "al-file-picker-input");
  input.type = "file";
  input.accept = accept;
  input.tabIndex = -1;
  input.setAttribute("aria-label", label);
  const trigger = createUiAction(label);
  trigger.classList.add("al-file-picker-trigger");
  trigger.addEventListener("click", () => input.click());
  element.append(trigger, input);
  return { element, input, trigger };
}

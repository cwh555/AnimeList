export type SerialEntryKeyboardTarget = HTMLElement | (() => HTMLElement | null);

export interface SerialEntryKeyboardNavigation {
  update(targets: readonly SerialEntryKeyboardTarget[]): void;
  destroy(): void;
}

interface BackspaceInputState {
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
}

export function backspaceWillClearInput(input: BackspaceInputState): boolean {
  if (!input.value) return true;
  const { selectionStart, selectionEnd } = input;
  if (selectionStart === null || selectionEnd === null) return false;
  if (selectionStart === 0 && selectionEnd === input.value.length) return true;
  return input.value.length === 1 && selectionStart === 1 && selectionEnd === 1;
}

function resolveTarget(target: SerialEntryKeyboardTarget): HTMLElement | null {
  const resolved = typeof target === "function" ? target() : target;
  if (!resolved || resolved.hasAttribute("disabled")) return null;
  return resolved;
}

function focusControl(control: HTMLElement): void {
  control.focus();
  if (control.tagName === "INPUT") (control as HTMLInputElement).select();
}

function isTextInput(control: HTMLElement): control is HTMLInputElement {
  if (control.tagName !== "INPUT") return false;
  const input = control as HTMLInputElement;
  return input.type !== "button"
    && input.type !== "submit"
    && input.type !== "reset";
}

function plainEnter(event: KeyboardEvent): boolean {
  return event.key === "Enter"
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.isComposing;
}

function plainBackspace(event: KeyboardEvent): boolean {
  return event.key === "Backspace"
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey;
}

export function createSerialEntryKeyboardNavigation(
  root: HTMLElement,
): SerialEntryKeyboardNavigation {
  let targets: readonly SerialEntryKeyboardTarget[] = [];

  const resolvedControls = (): HTMLElement[] => targets
    .map(resolveTarget)
    .filter((control): control is HTMLElement => control !== null);

  const move = (controls: readonly HTMLElement[], index: number): boolean => {
    const target = controls[index];
    if (!target) return false;
    focusControl(target);
    return true;
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    const current = event.target;
    if (!(current instanceof HTMLElement)) return;
    const controls = resolvedControls();
    const index = controls.indexOf(current);
    if (index < 0) return;

    if (event.key === "Tab" && !event.shiftKey) {
      if (!move(controls, index + 1)) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (plainEnter(event) && isTextInput(current)) {
      if (!move(controls, index + 1)) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!plainBackspace(event) || !isTextInput(current) || !backspaceWillClearInput(current)) return;
    const previous = controls[index - 1];
    if (!previous) return;
    if (current.value) {
      current.value = "";
      current.dispatchEvent(new Event("input", { bubbles: true }));
    }
    focusControl(previous);
    event.preventDefault();
    event.stopPropagation();
  };

  root.addEventListener("keydown", handleKeydown, true);
  return {
    update(nextTargets): void {
      targets = [...nextTargets];
    },
    destroy(): void {
      root.removeEventListener("keydown", handleKeydown, true);
      targets = [];
    },
  };
}

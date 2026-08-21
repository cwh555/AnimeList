import { uiText } from "../ui-text";

declare function createDiv(options?: string | DomElementInfo): HTMLDivElement;
declare function createSpan(options?: string | DomElementInfo): HTMLSpanElement;

export interface SegmentedDateParts {
  readonly year: HTMLInputElement;
  readonly month: HTMLInputElement;
  readonly day: HTMLInputElement;
}

export interface SegmentedDateInputElement extends HTMLDivElement {
  value: string;
  required: boolean;
  readonly parts: SegmentedDateParts;
}

export type SegmentedDateFocusTarget = HTMLElement | (() => HTMLElement | null);
export type SegmentedDateCompletionTarget = SegmentedDateFocusTarget;

export interface SegmentedDateInputOptions {
  completionTarget?: SegmentedDateCompletionTarget;
  emptyYearBackspaceTarget?: SegmentedDateFocusTarget;
}

export const SEGMENTED_DATE_PARTS = {
  year: { length: 4, placeholder: "YYYY" },
  month: { length: 2, placeholder: "MM" },
  day: { length: 2, placeholder: "DD" },
} as const;

export function normalizeDateParts(year: string, month: string, day: string): string {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return "";
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(yearNumber, monthNumber - 1, dayNumber);
  if (
    date.getFullYear() !== yearNumber
    || date.getMonth() !== monthNumber - 1
    || date.getDate() !== dayNumber
  ) return "";
  return `${year}-${month}-${day}`;
}

function formControls(control: HTMLElement): HTMLElement[] {
  const scope = control.closest(".modal-content") ?? control.ownerDocument.body;
  return [...scope.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex]")]
    .filter((candidate) => !candidate.hasAttribute("disabled")
      && candidate.tabIndex >= 0
      && (candidate === control || candidate.getClientRects().length > 0));
}

function focusNextFormControl(control: HTMLElement): void {
  const controls = formControls(control);
  const index = controls.indexOf(control);
  controls[index + 1]?.focus();
}

function resolveFocusTarget(target: SegmentedDateFocusTarget | undefined): HTMLElement | null {
  return typeof target === "function" ? target() : target ?? null;
}

function focusTarget(target: SegmentedDateFocusTarget | undefined, selectText: boolean): boolean {
  const resolved = resolveFocusTarget(target);
  if (!resolved || resolved.hasAttribute("disabled")) return false;
  resolved.focus();
  if (selectText) {
    const selectable = resolved as HTMLElement & { select?: () => void };
    selectable.select?.();
  }
  return true;
}

function focusPreviousFormControl(control: HTMLElement): boolean {
  const controls = formControls(control);
  const index = controls.indexOf(control);
  const previous = index > 0 ? controls[index - 1] : null;
  return focusTarget(previous, true);
}

export function handleSegmentedDateBackspace(
  input: HTMLInputElement,
  previousSegment: HTMLInputElement | null,
  key: string,
  emptyYearTarget?: SegmentedDateFocusTarget,
  fallback: (control: HTMLElement) => boolean = focusPreviousFormControl,
): boolean {
  if (key !== "Backspace" || input.value) return false;
  if (previousSegment) return focusTarget(previousSegment, true);
  if (focusTarget(emptyYearTarget, true)) return true;
  return fallback(input);
}

export function focusSegmentedDateCompletion(
  source: HTMLElement,
  completionTarget: SegmentedDateCompletionTarget | undefined,
  fallback: (control: HTMLElement) => void = focusNextFormControl,
): void {
  if (!focusTarget(completionTarget, false)) fallback(source);
}

function dateSegment(length: number, placeholder: string, label: string): HTMLInputElement {
  const input = createEl("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = length;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  return input;
}

function dateSeparator(): HTMLSpanElement {
  return createSpan({ cls: "al-date-separator", text: "-" });
}

export function createSegmentedDateInput(
  value = "",
  options: SegmentedDateInputOptions = {},
): SegmentedDateInputElement {
  const root = createDiv({ cls: "al-date-input" }) as SegmentedDateInputElement;
  root.setAttribute("role", "group");

  const year = dateSegment(SEGMENTED_DATE_PARTS.year.length, SEGMENTED_DATE_PARTS.year.placeholder, uiText("date.year"));
  const month = dateSegment(SEGMENTED_DATE_PARTS.month.length, SEGMENTED_DATE_PARTS.month.placeholder, uiText("date.month"));
  const day = dateSegment(SEGMENTED_DATE_PARTS.day.length, SEGMENTED_DATE_PARTS.day.placeholder, uiText("date.day"));
  year.className = "al-date-year";
  month.className = "al-date-month";
  day.className = "al-date-day";
  root.append(year, dateSeparator(), month, dateSeparator(), day);
  Object.defineProperty(root, "parts", {
    configurable: false,
    enumerable: false,
    value: Object.freeze({ year, month, day }),
  });

  const emit = (name: "input" | "change"): void => {
    root.dispatchEvent(new Event(name, { bubbles: true }));
  };
  const setValue = (nextValue: string): void => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nextValue || ""));
    year.value = match?.[1] ?? "";
    month.value = match?.[2] ?? "";
    day.value = match?.[3] ?? "";
  };

  Object.defineProperty(root, "value", {
    configurable: true,
    get: () => normalizeDateParts(year.value, month.value, day.value),
    set: setValue,
  });
  Object.defineProperty(root, "required", {
    configurable: true,
    get: () => year.required,
    set: (required: boolean) => {
      year.required = Boolean(required);
      month.required = Boolean(required);
      day.required = Boolean(required);
      root.setAttribute("aria-required", required ? "true" : "false");
    },
  });

  const bindSegment = (
    input: HTMLInputElement,
    maxLength: number,
    nextInput: HTMLInputElement | null = null,
  ): void => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, maxLength);
      emit("input");
      if (input.value.length !== maxLength) return;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else {
        focusSegmentedDateCompletion(input, options.completionTarget);
      }
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      const previous = input === day ? month : input === month ? year : null;
      if (handleSegmentedDateBackspace(
        input,
        previous,
        event.key,
        input === year ? options.emptyYearBackspaceTarget : undefined,
      )) event.preventDefault();
    });
  };

  bindSegment(year, SEGMENTED_DATE_PARTS.year.length, month);
  bindSegment(month, SEGMENTED_DATE_PARTS.month.length, day);
  bindSegment(day, SEGMENTED_DATE_PARTS.day.length);
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) emit("change");
  });
  setValue(value);
  return root;
}

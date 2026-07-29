import { uiText } from "./ui-text";

declare function createDiv(options?: string | DomElementInfo): HTMLDivElement;
declare function createSpan(options?: string | DomElementInfo): HTMLSpanElement;

export interface SegmentedDateInputElement extends HTMLDivElement {
  value: string;
  required: boolean;
}

export type SegmentedDateCompletionTarget = HTMLElement | (() => HTMLElement | null);

export interface SegmentedDateInputOptions {
  completionTarget?: SegmentedDateCompletionTarget;
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
      && candidate.offsetParent !== null);
}

function focusNextFormControl(control: HTMLElement): void {
  const controls = formControls(control);
  const index = controls.indexOf(control);
  controls[index + 1]?.focus();
}

function focusPreviousFormControl(control: HTMLElement): boolean {
  const controls = formControls(control);
  const index = controls.indexOf(control);
  const previous = index > 0 ? controls[index - 1] : null;
  if (!previous) return false;
  previous.focus();
  const selectable = previous as HTMLElement & { select?: () => void };
  selectable.select?.();
  return true;
}

export function handleSegmentedDateBackspace(
  input: HTMLInputElement,
  previousSegment: HTMLInputElement | null,
  key: string,
  fallback: (control: HTMLElement) => boolean = focusPreviousFormControl,
): boolean {
  if (key !== "Backspace" || input.value) return false;
  if (!previousSegment) return fallback(input);
  previousSegment.focus();
  previousSegment.select();
  return true;
}

export function focusSegmentedDateCompletion(
  source: HTMLElement,
  completionTarget: SegmentedDateCompletionTarget | undefined,
  fallback: (control: HTMLElement) => void = focusNextFormControl,
): void {
  const target = typeof completionTarget === "function" ? completionTarget() : completionTarget;
  if (target && !target.hasAttribute("disabled")) {
    target.focus();
    return;
  }
  fallback(source);
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
      if (handleSegmentedDateBackspace(input, previous, event.key)) event.preventDefault();
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

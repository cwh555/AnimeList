import { uiText } from "./ui-text";

declare function createDiv(options?: string | DomElementInfo): HTMLDivElement;
declare function createSpan(options?: string | DomElementInfo): HTMLSpanElement;

export interface SegmentedDateInputElement extends HTMLDivElement {
  value: string;
  required: boolean;
}

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

function focusNextFormControl(control: HTMLElement): void {
  const scope = control.closest(".modal-content") ?? control.ownerDocument.body;
  const controls = [...scope.querySelectorAll<HTMLElement>("input, select, textarea, button, [tabindex]")]
    .filter((candidate) => !candidate.hasAttribute("disabled")
      && candidate.tabIndex >= 0
      && candidate.offsetParent !== null);
  const index = controls.indexOf(control);
  controls[index + 1]?.focus();
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

export function createSegmentedDateInput(value = ""): SegmentedDateInputElement {
  const root = createDiv({ cls: "al-date-input" }) as SegmentedDateInputElement;
  root.setAttribute("role", "group");

  const year = dateSegment(4, "YYYY", uiText("date.year"));
  const month = dateSegment(2, "MM", uiText("date.month"));
  const day = dateSegment(2, "DD", uiText("date.day"));
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
        focusNextFormControl(input);
      }
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace" || input.value) return;
      const previous = input === day ? month : input === month ? year : null;
      if (previous) {
        event.preventDefault();
        previous.focus();
        previous.select();
      }
    });
  };

  bindSegment(year, 4, month);
  bindSegment(month, 2, day);
  bindSegment(day, 2);
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) emit("change");
  });
  setValue(value);
  return root;
}

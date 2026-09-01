import {
  MAX_RATING,
  MIN_RATING,
  stepRating,
  type RatingStepDirection,
} from "../domain/rating";

function emitInput(input: HTMLInputElement): void {
  const EventConstructor = input.ownerDocument.defaultView?.Event ?? Event;
  input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
}

function syncAccessibleValue(input: HTMLInputElement): void {
  const text = input.value.trim();
  if (!text) {
    input.removeAttribute("aria-valuenow");
    return;
  }
  const value = Number(text);
  if (Number.isFinite(value) && value >= MIN_RATING && value <= MAX_RATING) {
    input.setAttribute("aria-valuenow", String(value));
  } else {
    input.removeAttribute("aria-valuenow");
  }
}

export function installRatingInputBehavior(input: HTMLInputElement): () => void {
  // Native number inputs can change while the user is merely wheeling over a
  // focused field. Keep rating entry text-based and own every stepping action.
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "spinbutton");
  input.setAttribute("aria-valuemin", String(MIN_RATING));
  input.setAttribute("aria-valuemax", String(MAX_RATING));

  const handleInput = (): void => syncAccessibleValue(input);
  const handleKeydown = (event: KeyboardEvent): void => {
    let direction: RatingStepDirection | null = null;
    if (event.key === "ArrowUp") direction = 1;
    else if (event.key === "ArrowDown") direction = -1;
    if (direction === null) return;

    const next = stepRating(input.value.trim(), direction);
    if (next === null) return;
    event.preventDefault();
    input.value = String(next);
    syncAccessibleValue(input);
    emitInput(input);
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  syncAccessibleValue(input);

  return () => {
    input.removeEventListener("input", handleInput);
    input.removeEventListener("keydown", handleKeydown);
  };
}

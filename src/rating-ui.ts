import { Notice, type Plugin } from "obsidian";
import { ratingFeatureText } from "./rating-feature-text";
import {
  MAX_RATING,
  MIN_RATING,
  RATING_INCREMENT,
  formatRating,
  normalizeRating,
} from "./rating";

const SCORE_INPUT_SELECTOR = [
  '.al-media-form input[type="number"]',
  `[min="${MIN_RATING}"]`,
  `[max="${MAX_RATING}"]`,
].join("");

interface CrossWindowInstance {
  instanceOf<T>(type: { prototype: T }): this is T;
}

function supportsCrossWindowInstance(value: unknown): value is CrossWindowInstance {
  return typeof value === "object"
    && value !== null
    && "instanceOf" in value
    && typeof Reflect.get(value, "instanceOf") === "function";
}

function isElement(value: unknown): value is Element {
  return supportsCrossWindowInstance(value) && value.instanceOf(Element);
}

function isInputElement(value: unknown): value is HTMLInputElement {
  return supportsCrossWindowInstance(value) && value.instanceOf(HTMLInputElement);
}

function scoreInputWithin(target: EventTarget | null): HTMLInputElement | null {
  if (!isElement(target)) return null;
  const modal = target.closest(".animelist-modal");
  return modal?.querySelector<HTMLInputElement>(SCORE_INPUT_SELECTOR) ?? null;
}

function configureScoreInput(input: HTMLInputElement): void {
  input.step = String(RATING_INCREMENT);
}

function configureScoreInputs(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>(SCORE_INPUT_SELECTOR).forEach(configureScoreInput);
}

function normalizeScoreBeforeAction(target: EventTarget | null): void {
  if (!isElement(target)) return;
  const action = target.closest<HTMLButtonElement>("button.mod-cta");
  if (!action) return;

  const input = scoreInputWithin(action);
  if (!input) return;
  configureScoreInput(input);

  const result = normalizeRating(input.value.trim());
  if (result.kind !== "valid" || !result.changed) return;

  input.value = formatRating(result.value);
  new Notice(ratingFeatureText("adjusted", {
    original: result.original,
    rounded: formatRating(result.value),
  }));
}

function configureFocusedScoreInput(target: EventTarget | null): void {
  if (!isInputElement(target) || !target.matches(SCORE_INPUT_SELECTOR)) return;
  configureScoreInput(target);
}

export function installRatingUi(plugin: Plugin): void {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (isElement(node)) configureScoreInputs(node);
      });
    });
  });
  const handleFocus = (event: FocusEvent): void => configureFocusedScoreInput(event.target);
  const handleClick = (event: MouseEvent): void => normalizeScoreBeforeAction(event.target);

  observer.observe(document.documentElement, { childList: true, subtree: true });
  configureScoreInputs(document);
  document.addEventListener("focusin", handleFocus, true);
  document.addEventListener("click", handleClick, true);

  plugin.register(() => {
    observer.disconnect();
    document.removeEventListener("focusin", handleFocus, true);
    document.removeEventListener("click", handleClick, true);
  });
}

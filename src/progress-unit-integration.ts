import { Notice, type App, type TFile } from "obsidian";
import {
  normalizeProgressUnit,
  PROGRESS_UNIT_UI_TEXT,
  progressUnitLabel,
  progressUnitOptions,
  validateProgressForUnit,
} from "./progress-units";
import type { MediaType } from "./types";

const UNIT_VALUES = new Set(["episode", "chapter", "season", "volume"]);

interface ProgressUnitPluginHost {
  app: App;
}

function latestElement<T extends Element>(selector: string): T | null {
  const elements = document.querySelectorAll<T>(selector);
  return elements.item(elements.length - 1);
}

function replaceSelectOptions(select: HTMLSelectElement, mediaType: MediaType, current: unknown): void {
  const normalized = normalizeProgressUnit(current, mediaType);
  select.replaceChildren();
  for (const optionData of progressUnitOptions(mediaType, normalized)) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.appendChild(option);
  }
  select.value = normalized;
}

function existingUnitSelect(root: ParentNode): HTMLSelectElement | null {
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>("select"))) {
    const values = Array.from(select.options).map((option) => option.value);
    if (values.length > 0 && values.every((value) => UNIT_VALUES.has(value))) return select;
  }
  return null;
}

function progressInputBefore(unitField: Element): HTMLInputElement | null {
  let candidate = unitField.previousElementSibling;
  while (candidate) {
    const input = candidate.querySelector<HTMLInputElement>("input");
    if (input && input.type !== "date" && input.type !== "checkbox") return input;
    candidate = candidate.previousElementSibling;
  }
  return null;
}

function validateReadingProgress(unitField: Element, select: HTMLSelectElement): boolean {
  const input = progressInputBefore(unitField);
  if (!input) return true;
  const result = validateProgressForUnit(input.value, select.value);
  if (result.valid) return true;
  new Notice(PROGRESS_UNIT_UI_TEXT.integerProgressError);
  input.focus();
  input.select();
  return false;
}

function translateSeasonProgress(root: ParentNode): void {
  const selectors = [
    ".al-progress-on-cover",
    ".al-progress-row > span:first-child",
  ];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(selectors.join(",")))) {
    const text = element.textContent ?? "";
    if (!/(^|\s)season($|\s)/.test(text)) continue;
    element.textContent = text.replace(/(^|\s)season(?=$|\s)/g, `$1${progressUnitLabel("season")}`);
  }
}

export class ProgressUnitIntegration {
  private readonly observers = new Set<MutationObserver>();

  constructor(private readonly plugin: ProgressUnitPluginHost) {}

  dispose(): void {
    for (const observer of this.observers) observer.disconnect();
    this.observers.clear();
  }

  enhanceAddModal(): void {
    const modal = latestElement<HTMLElement>(".animelist-modal:not(.animelist-edit-modal)");
    if (!modal) return;
    const enhance = (): void => {
      const select = existingUnitSelect(modal);
      if (!select || select.dataset.animelistProgressUnits === "true") {
        translateSeasonProgress(modal);
        return;
      }
      const current = select.value;
      const mediaType: MediaType = current === "episode" ? "anime" : current === "volume" ? "novel" : "manga";
      if (mediaType !== "anime") replaceSelectOptions(select, mediaType, current);
      select.dataset.animelistProgressUnits = "true";
      const unitField = select.closest(".al-form-field");
      const submit = modal.querySelector<HTMLButtonElement>(".al-modal-actions .mod-cta");
      if (unitField && submit) {
        submit.addEventListener("click", (event) => {
          if (validateReadingProgress(unitField, select)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, { capture: true });
      }
      translateSeasonProgress(modal);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(modal, { childList: true, subtree: true });
    this.observers.add(observer);
  }

  enhanceEditModal(file: TFile, mediaType: MediaType, currentUnit: unknown): void {
    if (mediaType === "anime") return;
    const modal = latestElement<HTMLElement>(".animelist-edit-modal");
    const form = modal?.querySelector<HTMLElement>(".al-media-form");
    if (!modal || !form || existingUnitSelect(form)) return;

    const wrapper = document.createElement("label");
    wrapper.className = "al-form-field";
    const label = document.createElement("span");
    label.className = "al-form-label";
    label.textContent = PROGRESS_UNIT_UI_TEXT.fieldLabel;
    const select = document.createElement("select");
    replaceSelectOptions(select, mediaType, currentUnit);
    wrapper.append(label, select);

    const progressField = Array.from(form.querySelectorAll<HTMLElement>(".al-form-field"))
      .find((field) => field.querySelector<HTMLElement>(".al-form-label")?.textContent
        ?.startsWith(PROGRESS_UNIT_UI_TEXT.readingProgressLabelPrefix));
    if (progressField?.nextSibling) form.insertBefore(wrapper, progressField.nextSibling);
    else form.appendChild(wrapper);

    const save = modal.querySelector<HTMLButtonElement>(".al-modal-actions .mod-cta");
    if (!save) return;
    save.addEventListener("click", (event) => {
      if (!validateReadingProgress(wrapper, select)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const fileManager = this.plugin.app.fileManager;
      const original = fileManager.processFrontMatter.bind(fileManager);
      let restored = false;
      const restore = (): void => {
        if (restored) return;
        restored = true;
        fileManager.processFrontMatter = original;
      };
      fileManager.processFrontMatter = async (target, callback): Promise<void> => {
        if (target !== file) return original(target, callback);
        try {
          await original(target, (frontmatter) => {
            callback(frontmatter);
            frontmatter.progress_unit = select.value;
          });
        } finally {
          restore();
        }
      };
      window.setTimeout(restore, 0);
    }, { capture: true });
  }
}

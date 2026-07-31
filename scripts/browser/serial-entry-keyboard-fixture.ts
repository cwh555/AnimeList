import { createSerialEntryDateControls } from "../../src/ui/serial-entry-date-controls";
import { createSerialEntryKeyboardNavigation } from "../../src/ui/serial-entry-keyboard-navigation";
import { scheduleStableSerialEntryFocus } from "../../src/serial-entry-scroll-stability";

declare global {
  interface HTMLElement {
    createDiv(info?: string | DomElementInfo): HTMLDivElement;
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, info?: DomElementInfo): HTMLElementTagNameMap[K];
    createSpan(info?: string | DomElementInfo): HTMLSpanElement;
  }
}

function applyInfo<T extends HTMLElement>(element: T, info?: string | DomElementInfo): T {
  if (typeof info === "string") element.className = info;
  else if (info) {
    if (info.cls) element.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
    if (info.text !== undefined) element.textContent = String(info.text);
  }
  return element;
}

export interface SerialBrowserRow {
  row: HTMLElement;
  label: HTMLInputElement;
  remove: HTMLButtonElement;
  startedAt: ReturnType<typeof createSerialEntryDateControls>["startedAt"];
  completedAt: ReturnType<typeof createSerialEntryDateControls>["completedAt"];
}

export function installDomHelpers(): void {
  HTMLElement.prototype.createDiv = function createDiv(info) {
    const element = applyInfo(document.createElement("div"), info);
    this.appendChild(element);
    return element;
  };
  HTMLElement.prototype.createEl = function createEl(tag, info) {
    const element = applyInfo(document.createElement(tag), info);
    this.appendChild(element);
    return element;
  };
  HTMLElement.prototype.createSpan = function createSpan(info) {
    const element = applyInfo(document.createElement("span"), info);
    this.appendChild(element);
    return element;
  };
  Reflect.set(window, "createEl", (tag: string, info?: DomElementInfo) => applyInfo(document.createElement(tag), info));
  Reflect.set(window, "createDiv", (info?: DomElementInfo) => applyInfo(document.createElement("div"), info));
  Reflect.set(window, "createSpan", (info?: DomElementInfo) => applyInfo(document.createElement("span"), info));
}

function field(name: string, control: HTMLElement): HTMLLabelElement {
  const element = document.createElement("label");
  element.className = "al-form-field";
  element.dataset.serialField = name;
  element.appendChild(control);
  return element;
}

export function createSerialBrowserFixture() {
  const editor = document.getElementById("editor") as HTMLElement;
  const save = document.getElementById("save") as HTMLButtonElement;
  const distraction = document.getElementById("favorite-distraction") as HTMLInputElement;
  const navigation = createSerialEntryKeyboardNavigation(editor);
  let rowCount = 1;
  let removeActivations = 0;
  const rows: SerialBrowserRow[] = [];

  const render = (): HTMLButtonElement => {
    editor.replaceChildren();
    rows.length = 0;
    const targets: Array<HTMLElement | (() => HTMLElement | null)> = [];
    const rowsRoot = editor.createDiv({ cls: "al-volume-editor-rows" });
    for (let index = 0; index < rowCount; index += 1) {
      const row = rowsRoot.createDiv({ cls: "al-volume-row" });
      const fields = row.createDiv({ cls: "al-volume-row-fields" });
      const label = document.createElement("input");
      label.type = "text";
      label.value = String(index + 1);
      fields.appendChild(field("label", label));
      const actions = row.createDiv({ cls: "al-volume-row-actions" });
      const remove = actions.createEl("button", { text: "Remove" });
      remove.type = "button";
      remove.addEventListener("click", () => { removeActivations += 1; });
      const dates = createSerialEntryDateControls({
        labelInput: label,
        removeButton: remove,
        startedAt: "",
        completedAt: "",
      });
      fields.appendChild(field("started-at", dates.startedAt));
      fields.appendChild(field("completed-at", dates.completedAt));
      const coverPanel = row.createDiv({ cls: "al-serial-cover-panel" });
      coverPanel.createEl("button", { text: "Cover" }).type = "button";
      targets.push(
        label,
        dates.startedAt.parts.year,
        dates.startedAt.parts.month,
        dates.startedAt.parts.day,
        dates.completedAt.parts.year,
        dates.completedAt.parts.month,
        dates.completedAt.parts.day,
        remove,
      );
      rows.push({ row, label, remove, ...dates });
    }
    const add = editor.createEl("button", { text: "Add entry" });
    add.type = "button";
    add.addEventListener("click", () => {
      rowCount += 1;
      render();
      scheduleStableSerialEntryFocus(editor, { restore() {} });
    });
    targets.push(add, () => save);
    navigation.update(targets);
    return add;
  };

  return {
    editor,
    save,
    distraction,
    rows,
    render,
    press(control: HTMLElement, key: string, options: KeyboardEventInit = {}): boolean {
      control.focus();
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
      control.dispatchEvent(event);
      return event.defaultPrevented;
    },
    removeActivations: () => removeActivations,
  };
}

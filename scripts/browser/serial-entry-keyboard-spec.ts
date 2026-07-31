import { createSerialBrowserFixture, installDomHelpers } from "./serial-entry-keyboard-fixture";

function record(details: Record<string, boolean>, key: string, value: unknown): void {
  details[key] = Boolean(value);
}

async function run(): Promise<void> {
  installDomHelpers();
  const fixture = createSerialBrowserFixture();
  const details: Record<string, boolean> = {};
  let add = fixture.render();
  let row = fixture.rows[0];
  const { press } = fixture;

  record(details, "tabLabel", press(row.label, "Tab") && document.activeElement === row.startedAt.parts.year);
  record(details, "enterStartYear", press(row.startedAt.parts.year, "Enter") && document.activeElement === row.startedAt.parts.month);
  record(details, "enterStartMonth", press(row.startedAt.parts.month, "Enter") && document.activeElement === row.startedAt.parts.day);
  record(details, "enterStartDay", press(row.startedAt.parts.day, "Enter") && document.activeElement === row.completedAt.parts.year);
  record(details, "enterCompletedYear", press(row.completedAt.parts.year, "Enter") && document.activeElement === row.completedAt.parts.month);
  record(details, "enterCompletedMonth", press(row.completedAt.parts.month, "Enter") && document.activeElement === row.completedAt.parts.day);
  record(details, "enterCompletedDay", press(row.completedAt.parts.day, "Enter") && document.activeElement === row.remove);

  record(details, "removeEnterUntouched", press(row.remove, "Enter") === false);
  row.remove.click();
  record(details, "removeFunction", fixture.removeActivations() === 1);
  record(details, "removeTab", press(row.remove, "Tab") && document.activeElement === add);
  record(details, "addTab", press(add, "Tab") && document.activeElement === fixture.save);
  record(details, "skipDistraction", document.activeElement !== fixture.distraction);
  record(details, "saveEnterUntouched", press(fixture.save, "Enter") === false);

  record(details, "addEnterUntouched", press(add, "Enter") === false);
  add.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  add = fixture.editor.querySelector(":scope > button") as HTMLButtonElement;
  row = fixture.rows[1];
  record(details, "addCreatedRow", fixture.rows.length === 2);
  record(details, "addFocusedLabel", document.activeElement === row.label);
  record(details, "addSelectedLabel", row.label.selectionStart === 0 && row.label.selectionEnd === row.label.value.length);

  record(details, "crossRowRemoveTab", press(fixture.rows[0].remove, "Tab") && document.activeElement === row.label);
  row.label.select();
  record(details, "crossRowBackspace", press(row.label, "Backspace") && row.label.value === "" && document.activeElement === fixture.rows[0].remove);
  row.label.value = "2";

  const tabSequence: Array<[HTMLElement, HTMLElement]> = [
    [row.label, row.startedAt.parts.year],
    [row.startedAt.parts.year, row.startedAt.parts.month],
    [row.startedAt.parts.month, row.startedAt.parts.day],
    [row.startedAt.parts.day, row.completedAt.parts.year],
    [row.completedAt.parts.year, row.completedAt.parts.month],
    [row.completedAt.parts.month, row.completedAt.parts.day],
    [row.completedAt.parts.day, row.remove],
    [row.remove, add],
  ];
  for (const [index, [source, target]] of tabSequence.entries()) {
    record(details, `tabSequence${index}`, press(source, "Tab") && document.activeElement === target);
  }

  row.startedAt.parts.year.value = "2026";
  row.startedAt.parts.year.select();
  record(details, "backspaceStartYear", press(row.startedAt.parts.year, "Backspace")
    && row.startedAt.parts.year.value === "" && document.activeElement === row.label);
  row.completedAt.parts.year.value = "2026";
  row.completedAt.parts.year.select();
  record(details, "backspaceCompletedYear", press(row.completedAt.parts.year, "Backspace")
    && row.completedAt.parts.year.value === "" && document.activeElement === row.startedAt.parts.day);
  row.startedAt.parts.month.value = "7";
  row.startedAt.parts.month.setSelectionRange(1, 1);
  record(details, "backspaceFinalCharacter", press(row.startedAt.parts.month, "Backspace")
    && row.startedAt.parts.month.value === "" && document.activeElement === row.startedAt.parts.year);
  row.startedAt.parts.year.value = "2026";
  row.startedAt.parts.year.setSelectionRange(4, 4);
  record(details, "backspacePartialUntouched", press(row.startedAt.parts.year, "Backspace") === false
    && document.activeElement === row.startedAt.parts.year && row.startedAt.parts.year.value === "2026");

  row.startedAt.parts.year.value = "2026";
  row.startedAt.parts.month.value = "07";
  row.startedAt.parts.day.value = "31";
  row.startedAt.parts.day.dispatchEvent(new Event("input", { bubbles: true }));
  record(details, "startCompletion", document.activeElement === row.completedAt.parts.year);
  row.completedAt.parts.year.value = "2026";
  row.completedAt.parts.month.value = "07";
  row.completedAt.parts.day.value = "31";
  row.completedAt.parts.day.dispatchEvent(new Event("input", { bubbles: true }));
  record(details, "completedCompletion", document.activeElement === row.remove);

  document.body.dataset.details = JSON.stringify(details);
  document.body.dataset.result = Object.values(details).every(Boolean) ? "pass" : "fail";
}

void run().catch((error: unknown) => {
  document.body.dataset.details = error instanceof Error ? error.stack ?? error.message : String(error);
  document.body.dataset.result = "fail";
});

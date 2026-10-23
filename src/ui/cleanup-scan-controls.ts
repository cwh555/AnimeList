import type { CleanupScanMode } from "../data/cleanup-scan-history";

/** Shared scan-mode selector for all four independent Settings operations. */
export function createScanModeControl(
  parent: HTMLElement, defaultMode: CleanupScanMode = "pending",
): HTMLSelectElement {
  const label = parent.createEl("label", { cls: "al-form-field" });
  label.createSpan({ text: "Scan scope" });
  const select = label.createEl("select");
  select.createEl("option", { value: "pending", text: "Only new or unfinished items" });
  select.createEl("option", { value: "all", text: "Rescan all items" });
  select.value = defaultMode;
  return select;
}

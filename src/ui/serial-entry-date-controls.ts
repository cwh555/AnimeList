import {
  createSegmentedDateInput,
  type SegmentedDateInputElement,
} from "./segmented-date-input";

export interface SerialEntryDateControlOptions {
  readonly labelInput: HTMLInputElement;
  readonly removeButton: HTMLButtonElement;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SerialEntryDateControls {
  readonly startedAt: SegmentedDateInputElement;
  readonly completedAt: SegmentedDateInputElement;
}

export function createSerialEntryDateControls(
  options: SerialEntryDateControlOptions,
): SerialEntryDateControls {
  let completedAt: SegmentedDateInputElement | null = null;
  const startedAt = createSegmentedDateInput(options.startedAt, {
    completionTarget: () => completedAt?.parts.year ?? null,
    emptyYearBackspaceTarget: options.labelInput,
  });
  completedAt = createSegmentedDateInput(options.completedAt, {
    completionTarget: options.removeButton,
    emptyYearBackspaceTarget: startedAt.parts.day,
  });
  return { startedAt, completedAt };
}

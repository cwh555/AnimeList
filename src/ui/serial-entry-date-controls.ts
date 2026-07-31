import {
  createSegmentedDateInput,
  type SegmentedDateInputElement,
} from "../segmented-date-input";

export interface SerialEntryDateControlOptions {
  readonly labelInput: HTMLInputElement;
  readonly addButton: HTMLButtonElement;
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
  const startedAt = createSegmentedDateInput(options.startedAt, {
    emptyYearBackspaceTarget: options.labelInput,
  });
  const completedAt = createSegmentedDateInput(options.completedAt, {
    completionTarget: options.addButton,
    emptyYearBackspaceTarget: startedAt.parts.day,
  });
  return { startedAt, completedAt };
}

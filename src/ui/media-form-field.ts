export type MediaFormFieldRole = "progress";

const FIELD_ROLE_ATTRIBUTE = "data-animelist-field";

export function markMediaFormField(
  control: Element,
  role: MediaFormFieldRole,
): void {
  control.closest<HTMLElement>(".al-form-field")
    ?.setAttribute(FIELD_ROLE_ATTRIBUTE, role);
}

export function findMediaFormInput(
  form: Element,
  role: MediaFormFieldRole,
): HTMLInputElement | null {
  return form.querySelector<HTMLInputElement>(
    `.al-form-field[${FIELD_ROLE_ATTRIBUTE}="${role}"] input`,
  );
}

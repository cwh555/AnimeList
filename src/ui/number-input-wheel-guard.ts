export function installNumberInputWheelGuard(input: HTMLInputElement): () => void {
  if (input.type !== "number") return () => {};

  const handleWheel = (): void => {
    if (input.ownerDocument.activeElement === input) input.blur();
  };

  input.addEventListener("wheel", handleWheel, { passive: true });
  return () => input.removeEventListener("wheel", handleWheel);
}

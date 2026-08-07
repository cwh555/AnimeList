import * as Obsidian from "obsidian";

export function getObsidianInterfaceLanguage(): string | undefined {
  const obsidianModule = Obsidian as unknown as { getLanguage?: unknown };
  const getter = obsidianModule.getLanguage;
  if (typeof getter !== "function") return undefined;
  try {
    const value: unknown = (getter as () => unknown)();
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

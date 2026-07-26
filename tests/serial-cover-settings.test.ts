import assert from "node:assert/strict";
import test from "node:test";
import type { ButtonComponent, Setting, TextComponent } from "obsidian";
import { SerialCoverMigrationModal } from "../src/serial-cover-migration-modal";
import { configureSerialCoverProvider } from "../src/serial-cover-provider";
import { createSerialCoverSettingsSection } from "../src/serial-cover-settings";
import type { SerialCoverPlugin } from "../src/serial-cover-service";

function settingsPlugin(): {
  plugin: SerialCoverPlugin;
  savedCount: () => number;
} {
  let saved = 0;
  const plugin = {
    app: {},
    settings: { googleBooksApiKey: "existing-key" },
    async saveSettings(): Promise<void> {
      saved += 1;
    },
  } as unknown as SerialCoverPlugin;
  return { plugin, savedCount: () => saved };
}

test("serial cover settings use typed controls and preserve their actions", async () => {
  const { plugin, savedCount } = settingsPlugin();
  const section = createSerialCoverSettingsSection(plugin);
  assert.equal(section.definitions.length, 2);

  let placeholder = "";
  let inputValue = "";
  let onChange: ((value: string) => void | Promise<void>) | null = null;
  const input = {
    setPlaceholder(value: string) {
      placeholder = value;
      return this;
    },
    setValue(value: string) {
      inputValue = value;
      return this;
    },
    onChange(callback: (value: string) => void | Promise<void>) {
      onChange = callback;
      return this;
    },
  } as unknown as TextComponent;
  const textSetting = {
    addText(callback: (component: TextComponent) => void) {
      callback(input);
      return this;
    },
  } as unknown as Setting;

  const apiKeyDefinition = section.definitions[0];
  if (!apiKeyDefinition?.render) throw new Error("API key setting is not renderable");
  apiKeyDefinition.render(textSetting);
  assert.ok(placeholder);
  assert.equal(inputValue, "existing-key");
  if (onChange === null) throw new Error("API key change handler was not registered");
  await onChange("  updated-key  ");
  assert.equal(plugin.settings.googleBooksApiKey, "updated-key");
  assert.equal(savedCount(), 1);

  let onClick: ((event: MouseEvent) => void | Promise<void>) | null = null;
  const button = {
    setButtonText() { return this; },
    setCta() { return this; },
    onClick(callback: (event: MouseEvent) => void | Promise<void>) {
      onClick = callback;
      return this;
    },
  } as unknown as ButtonComponent;
  const buttonSetting = {
    addButton(callback: (component: ButtonComponent) => void) {
      callback(button);
      return this;
    },
  } as unknown as Setting;

  const migrationDefinition = section.definitions[1];
  if (!migrationDefinition?.render) throw new Error("Migration setting is not renderable");
  migrationDefinition.render(buttonSetting);
  if (onClick === null) throw new Error("Migration click handler was not registered");

  const originalOpen = SerialCoverMigrationModal.prototype.open;
  let opened = 0;
  SerialCoverMigrationModal.prototype.open = function open(): void {
    opened += 1;
  };
  try {
    await onClick({} as MouseEvent);
    assert.equal(opened, 1);
  } finally {
    SerialCoverMigrationModal.prototype.open = originalOpen;
    configureSerialCoverProvider({ apiKey: "" });
  }
});

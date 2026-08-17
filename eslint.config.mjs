import path from "node:path";
import { fileURLToPath } from "node:url";
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  { ignores: ["**/._*"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "types/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: root,
      },
    },
  },
  {
    // AnimeList keeps an imperative tabbed settings shell for Obsidian <1.13 compatibility.
    // On 1.13+, overriding getSettingDefinitions() bypasses display() and removes that shell.
    files: ["src/ui/settings.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);

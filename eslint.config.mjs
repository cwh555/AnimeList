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
    files: ["src/additional-progress-units-ui.ts"],
    rules: {
      "obsidianmd/prefer-create-el": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["src/classification-ui.ts"],
    rules: {
      "obsidianmd/prefer-create-el": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["src/classification-settings.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "of",
    },
  },
]);

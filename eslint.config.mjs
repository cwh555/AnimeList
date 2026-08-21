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
]);

import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";
const outfile = process.env.ANIMELIST_BUILD_OUTFILE || "main.js";

const context = await esbuild.context({
  entryPoints: ["src/plugin-entry.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile,
  minify: production,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
  console.log("Watching AnimeList source files...");
}

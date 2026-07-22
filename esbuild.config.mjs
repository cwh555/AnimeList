import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const production = process.argv[2] === "production";
const outfile = process.env.ANIMELIST_BUILD_OUTFILE || "main.js";
const SERIAL_STYLE_START = "/* BEGIN GENERATED SERIAL READING UI */";
const SERIAL_STYLE_END = "/* END GENERATED SERIAL READING UI */";

async function buildStyles() {
  const [currentStyles, serialStyles] = await Promise.all([
    readFile("styles.css", "utf8"),
    readFile("styles.serial-reading.css", "utf8"),
  ]);
  const generatedStart = currentStyles.indexOf(SERIAL_STYLE_START);
  const baseStyles = (generatedStart >= 0 ? currentStyles.slice(0, generatedStart) : currentStyles).trimEnd();
  const outputStyles = `${baseStyles}\n\n${SERIAL_STYLE_START}\n${serialStyles.trim()}\n${SERIAL_STYLE_END}\n`;
  await writeFile("styles.css", outputStyles, "utf8");
}

await buildStyles();

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
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

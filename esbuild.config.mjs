import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const production = process.argv[2] === "production";
const outfile = process.env.ANIMELIST_BUILD_OUTFILE || "main.js";
const GENERATED_STYLE_START = "/* BEGIN GENERATED FEATURE STYLES */";
const GENERATED_STYLE_END = "/* END GENERATED FEATURE STYLES */";
async function buildStyles() {
  const [currentStyles, serialStyles, progressStyles, masterpieceStyles, scoreDashboardStyles, serialCoverStyles, libraryListStyles] = await Promise.all([
    readFile("styles.css", "utf8"),
    readFile("styles.serial-reading.css", "utf8"),
    readFile("styles.progress.css", "utf8"),
    readFile("styles.masterpiece.css", "utf8"),
    readFile("styles.score-dashboard.css", "utf8"),
    readFile("styles.serial-cover.css", "utf8"),
    readFile("styles.library-list.css", "utf8"),
  ]);
  const generatedStart = currentStyles.indexOf(GENERATED_STYLE_START);
  const legacyGeneratedStart = currentStyles.indexOf("/* BEGIN GENERATED SERIAL READING UI */");
  const cutIndex = generatedStart >= 0 ? generatedStart : legacyGeneratedStart;
  const baseStyles = (cutIndex >= 0 ? currentStyles.slice(0, cutIndex) : currentStyles).trimEnd();
  const generatedStyles = [
    serialStyles.trim(),
    progressStyles.trim(),
    masterpieceStyles.trim(),
    scoreDashboardStyles.trim(),
    serialCoverStyles.trim(),
    libraryListStyles.trim(),
  ].join("\n\n");
  const outputStyles = `${baseStyles}\n\n${GENERATED_STYLE_START}\n${generatedStyles}\n${GENERATED_STYLE_END}\n`;
  await writeFile("styles.css", outputStyles, "utf8");
}
await buildStyles();
const context = await esbuild.context({
  entryPoints: ["src/plugin-entry.ts"], bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs", target: "es2022", logLevel: "info", sourcemap: production ? false : "inline",
  treeShaking: true, outfile, minify: production,
});
if (production) { await context.rebuild(); await context.dispose(); }
else { await context.watch(); console.log("Watching AnimeList source files..."); }

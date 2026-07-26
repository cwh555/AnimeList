import fs from "node:fs";

const path = "src/legacy.ts";
let source = fs.readFileSync(path, "utf8");
const unusedImport = "  centerTimelinePoint,\n";
if (!source.includes(unusedImport)) throw new Error("Missing centerTimelinePoint import");
source = source.replace(unusedImport, "");
fs.writeFileSync(path, source, "utf8");

for (const file of [
  ".github/workflows/timeline-diagnostics.yml",
  ".github/workflows/apply-timeline-import-cleanup.yml",
  "scripts/remove-unused-timeline-import.mjs",
]) {
  fs.rmSync(file, { force: true });
}

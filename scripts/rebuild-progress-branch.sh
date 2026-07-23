#!/usr/bin/env bash
set -euo pipefail

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git fetch origin preview
git reset --hard 3e35f6ad1e478e49dcf234e8e31893a09fb0c63d

cat > src/progress-display.ts <<'EOF'
import type { MediaStatus } from "./media-status";
import { normalizeMediaStatus } from "./media-status";
import { progressRatio } from "./novel-progress";
import type { MediaType, ProgressValue } from "./types";

export interface ProgressDisplayInput {
  mediaType: MediaType;
  status: MediaStatus | string;
  progress: ProgressValue;
  total: ProgressValue;
  unit: string;
}

export interface ProgressDisplay {
  ratio: number | null;
  percentageLabel: string | null;
}

export function hasRecordedProgress(value: ProgressValue): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return false;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue > 0 : text !== "0";
}

export function progressDisplay(input: ProgressDisplayInput): ProgressDisplay {
  if (input.mediaType === "anime") {
    const ratio = progressRatio(input.progress, input.total, input.unit);
    return {
      ratio,
      percentageLabel: ratio == null ? null : `${Math.round(ratio * 100)}%`,
    };
  }

  const status = normalizeMediaStatus(input.status);
  const ratio = status === "completed"
    ? 1
    : (status === "ongoing" || status === "dropped") && hasRecordedProgress(input.progress)
      ? 0.5
      : 0;
  return { ratio, percentageLabel: null };
}
EOF

python <<'PY'
from pathlib import Path
import re

path = Path("src/legacy.ts")
text = path.read_text()

media_import = 'import { mediaStatusMatches, normalizeMediaStatus, normalizeStatusFilter } from "./media-status";'
if media_import not in text:
    raise SystemExit("media-status import not found")
text = text.replace(media_import, media_import + '\nimport { progressDisplay } from "./progress-display";', 1)

text, count = re.subn(
    r'^  const ratio = \(item\) => item\.mediaType === "anime" \? progressRatio\(item\.progress, item\.total, item\.unit\) : null;$',
    '  const displayProgress = (item) => progressDisplay(item);\n  const ratio = (item) => displayProgress(item).ratio;',
    text,
    count=1,
    flags=re.MULTILINE,
)
if count != 1:
    raise SystemExit(f"ratio helper replacements: {count}")

card_start = '      const progress = makeEl("div", "al-progress");\n      const itemRatio = ratio(item);'
card_end = '      progress.appendChild(progressRow);'
start = text.find(card_start)
end = text.find(card_end, start)
if start < 0 or end < 0:
    raise SystemExit("library progress renderer not found")
card_replacement = '''      const progress = makeEl("div", "al-progress");
      const itemProgress = displayProgress(item);
      if (itemProgress.ratio !== null) {
        const bar = makeEl("div", "al-progress-track");
        const fill = makeEl("div", "al-progress-fill");
        fill.style.width = `${Math.round(itemProgress.ratio * 100)}%`;
        bar.appendChild(fill);
        progress.appendChild(bar);
      }
      const progressRow = makeEl("div", "al-progress-row");
      progressRow.appendChild(makeEl("span", "", progressText(item)));
      if (itemProgress.percentageLabel) progressRow.appendChild(makeEl("span", "", itemProgress.percentageLabel));
      else if (item.mediaType !== "anime") progressRow.appendChild(makeEl("span", "al-release-label", LABEL.releaseStatus[item.releaseStatus] || uiText("media.release.unknown")));
      progress.appendChild(progressRow);'''
text = text[:start] + card_replacement + text[end + len(card_end):]

detail_start = '    const progress = makeEl("span", "", hasTotal\n'
detail_end = '    summary.append(status, progress);'
start = text.find(detail_start)
end = text.find(detail_end, start)
if start < 0 or end < 0:
    raise SystemExit("detail progress renderer not found")
detail_replacement = '''    const progressText = hasTotal
      ? `${progressDisplayValue(detailItem.progress)} / ${progressDisplayValue(detailItem.total)} ${unitLabel}`
      : detailItem.progress !== 0 ? uiText(detailItem.mediaType === "anime" ? "library.watchedProgress" : "library.readProgress", { progress: progressDisplayValue(detailItem.progress), unit: unitLabel }) : uiText("detail.noProgress");
    const detailProgress = progressDisplay(detailItem);
    const progress = makeEl("div", "al-progress al-detail-progress");
    if (detailProgress.ratio !== null) {
      const track = makeEl("div", "al-progress-track");
      const fill = makeEl("div", "al-progress-fill");
      fill.style.width = `${Math.round(detailProgress.ratio * 100)}%`;
      track.appendChild(fill);
      progress.appendChild(track);
    }
    const row = makeEl("div", "al-progress-row");
    row.appendChild(makeEl("span", "", progressText));
    if (detailProgress.percentageLabel) row.appendChild(makeEl("span", "", detailProgress.percentageLabel));
    else if (detailItem.mediaType !== "anime") row.appendChild(makeEl("span", "al-release-label", LABEL.releaseStatus[detailItem.releaseStatus] || uiText("media.release.unknown")));
    progress.appendChild(row);
    summary.append(status, progress);'''
text = text[:start] + detail_replacement + text[end + len(detail_end):]

text = text.replace('  progressRatio,\n', '', 1)
path.write_text(text)
PY

python <<'PY'
from pathlib import Path
path = Path("styles.serial-reading.css")
text = path.read_text()
start = text.find("/* Manga and novel totals are frequently unknown.")
end = text.find("@media (max-width: 900px)", start)
if start < 0 or end < 0:
    raise SystemExit("legacy serial progress CSS not found")
text = text[:start] + text[end:]
text += '''

/* Shared progress layout for library cards and detail blocks. */
.al-grid.is-list .al-progress {
  width: 100%;
  max-width: none;
}

.al-detail-summary .al-detail-progress {
  min-width: min(320px, 42vw);
  margin-top: 0;
  padding-top: 0;
}

.al-detail-summary .al-detail-progress .al-progress-row {
  margin-top: 5px;
}

@media (max-width: 780px) {
  .al-detail-summary .al-detail-progress {
    width: 100%;
    min-width: 0;
  }
}
'''
path.write_text(text)
PY

cat > tests/progress-display.test.ts <<'EOF'
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { progressDisplay } from "../src/progress-display";

describe("progress display", () => {
  it("preserves numeric anime progress semantics", () => {
    assert.deepEqual(progressDisplay({ mediaType: "anime", status: "ongoing", progress: 3, total: 12, unit: "episode" }), {
      ratio: 0.25,
      percentageLabel: "25%",
    });
    assert.deepEqual(progressDisplay({ mediaType: "anime", status: "ongoing", progress: 3, total: 0, unit: "episode" }), {
      ratio: null,
      percentageLabel: null,
    });
  });

  it("maps serial media state to a track without a fake percentage label", () => {
    assert.deepEqual(progressDisplay({ mediaType: "manga", status: "completed", progress: 0, total: 0, unit: "chapter" }), { ratio: 1, percentageLabel: null });
    assert.deepEqual(progressDisplay({ mediaType: "manga", status: "ongoing", progress: 4, total: 0, unit: "chapter" }), { ratio: 0.5, percentageLabel: null });
    assert.deepEqual(progressDisplay({ mediaType: "novel", status: "dropped", progress: "EX", total: 0, unit: "volume" }), { ratio: 0.5, percentageLabel: null });
    assert.deepEqual(progressDisplay({ mediaType: "novel", status: "ongoing", progress: 0, total: 0, unit: "volume" }), { ratio: 0, percentageLabel: null });
    assert.deepEqual(progressDisplay({ mediaType: "manga", status: "planned", progress: 8, total: 0, unit: "chapter" }), { ratio: 0, percentageLabel: null });
  });
});
EOF

python <<'PY'
from pathlib import Path
path = Path("scripts/run-tests.mjs")
text = path.read_text()
marker = '  \'import "../../tests/media-status.test.ts";\',\n'
if marker not in text:
    raise SystemExit("test entry marker not found")
text = text.replace(marker, marker + '  \'import "../../tests/progress-display.test.ts";\',\n', 1)
path.write_text(text)
PY

git add src/progress-display.ts src/legacy.ts styles.serial-reading.css tests/progress-display.test.ts scripts/run-tests.mjs
git commit -m "feat: unify progress presentation"
npm ci
npm run check
npm run release:check
git push --force origin HEAD:feature/unified-progress-display

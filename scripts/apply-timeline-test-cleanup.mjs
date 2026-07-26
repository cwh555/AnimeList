import { readFileSync, writeFileSync } from "node:fs";

function replaceOrThrow(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected block not found in ${path}`);
  writeFileSync(path, source.replace(before, after));
}

replaceOrThrow(
  "tests/core.test.ts",
  `  it("shows novel volume labels and uses collision-aware vertical lanes", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /al-timeline-volume-label/);
    assert.match(legacySource, /assignTimelineLanes\\(positionedItems, CARD_WIDTH \\+ CARD_GAP_X\\)/);
    assert.match(legacySource, /aboveAxis = lane % 2 === 0/);
    assert.match(stylesheet, /\\.al-timeline-volume-label/);
  });`,
  `  it("shows novel volume labels through the tracked timeline classes", () => {
    const legacySource = readFileSync(path.join(process.cwd(), "src/legacy.ts"), "utf8");
    const stylesheet = readFileSync(path.join(process.cwd(), "styles.css"), "utf8");
    assert.match(legacySource, /al-timeline-volume-label/);
    assert.match(legacySource, /aboveAxis = lane % 2 === 0/);
    assert.match(stylesheet, /\\.al-timeline-volume-label/);
  });`,
);

replaceOrThrow(
  "tests/timeline-scale.test.ts",
  `    assert.equal(Math.max(...firstDayLanes), 9);
    assert.deepEqual(secondDayLanes, [0, 1, 2]);
    assert.ok(secondDayX - firstDayX >= MINIMUM_CARD_DISTANCE);
`,
  `    assert.equal(Math.max(...firstDayLanes), 9);
    assert.deepEqual(secondDayLanes, [0, 1, 2]);
    assert.ok(firstDayCards.every((card) => Number.parseFloat(card.style.left) + 60 === firstDayX));
    assert.ok(secondDayCards.every((card) => Number.parseFloat(card.style.left) + 60 === secondDayX));
    assert.ok(secondDayX - firstDayX >= MINIMUM_CARD_DISTANCE);
`,
);

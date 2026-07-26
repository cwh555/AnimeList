from pathlib import Path
from textwrap import dedent


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_test(path: str, title: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    start_marker = f'  it("{title}", () => {{'
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{path}: missing test {title!r}")
    end = text.find("\n  });", start)
    if end < 0:
        raise SystemExit(f"{path}: unterminated test {title!r}")
    end += len("\n  });")
    file.write_text(text[:start] + dedent(replacement).strip("\n") + text[end:], encoding="utf-8")


replace_once("src/legacy.ts", '  centerTimelinePoint,\n', '  centerTimelineLatestDateAndAxis,\n')
replace_once(
    "src/legacy.ts",
    '} from "./timeline-scale";\n\nconst PLUGIN_VERSION',
    '} from "./timeline-scale";\nimport { timelineSerialLabel } from "./timeline-entry";\n\nconst PLUGIN_VERSION',
)
replace_once(
    "src/legacy.ts",
    '          text.appendChild(makeEl("span", "al-timeline-volume-label", uiText("timeline.volumeLabel", { volume: item.volumeLabel })));',
    '          text.appendChild(makeEl("span", "al-timeline-volume-label", timelineSerialLabel(item, item.volumeLabel)));',
)
replace_once(
    "src/legacy.ts",
    "      const pan = centerTimelinePoint(\n",
    "      const pan = centerTimelineLatestDateAndAxis(\n",
)
replace_once("src/legacy.ts", "        state.latestItemCenterY,\n", "        state.axisY,\n")

replace_test(
    "tests/timeline-scale.test.ts",
    "initializes and restores the latest timeline card at viewport center",
    r'''
    it("centers the latest date horizontally and the timeline axis vertically", () => {
      installFakeDom();
      const container = new FakeElement("div");
      legacyTest.TimelineUI.render(container, Array.from({ length: 9 }, (_, index) => timelineItem(index)), {
        maxStackDepth: 3,
      });

      const viewport = descendantsByClass(container, "al-timeline-viewport")[0];
      const scene = descendantsByClass(container, "al-timeline-scene")[0];
      const latest = descendantsByClass(container, "al-timeline-card")
        .find((card) => card.title.includes("Newest"));
      const initialAxis = descendantsByClass(container, "al-timeline-axis")[0];
      assert.ok(latest);

      const initialCenter = screenCenter(latest, scene);
      const initialTransform = parseTransform(scene.style.transform);
      const initialAxisScreenY = initialTransform.y
        + Number.parseFloat(initialAxis.style.top) * initialTransform.scale;
      assert.equal(initialCenter.x, viewport.clientWidth / 2);
      assert.equal(initialAxisScreenY, viewport.clientHeight / 2);

      descendantByAttribute(container, "aria-label", uiText("timeline.fit")).dispatch("click");
      descendantByAttribute(container, "aria-label", uiText("timeline.reset")).dispatch("click");

      const restoredLatest = descendantsByClass(container, "al-timeline-card")
        .find((card) => card.title.includes("Newest"));
      const restoredAxis = descendantsByClass(container, "al-timeline-axis")[0];
      assert.ok(restoredLatest);
      const restoredCenter = screenCenter(restoredLatest, scene);
      const restoredTransform = parseTransform(scene.style.transform);
      const restoredAxisScreenY = restoredTransform.y
        + Number.parseFloat(restoredAxis.style.top) * restoredTransform.scale;
      assert.equal(restoredCenter.x, viewport.clientWidth / 2);
      assert.equal(restoredAxisScreenY, viewport.clientHeight / 2);
    });
    ''',
)

test_file = Path("tests/timeline-scale.test.ts")
test_text = test_file.read_text(encoding="utf-8")
marker = '  it("keeps the timeline axis at the same screen y while wheel-scaling time", () => {'
if test_text.count(marker) != 1:
    raise SystemExit("tests/timeline-scale.test.ts: missing wheel-scaling test marker")
unit_test = dedent(r'''
  it("renders dated entries with their configured reading units", () => {
    installFakeDom();
    const container = new FakeElement("div");
    const chapter = {
      ...timelineItem(0), title: "Chapter work", mediaType: "manga", unit: "chapter",
      status: "ongoing", completedAt: "",
      volumeLog: [{ label: "10", startedAt: "", completedAt: "2026-07-01" }],
    };
    const season = {
      ...timelineItem(1), title: "Season work", mediaType: "novel", unit: "season",
      status: "ongoing", completedAt: "",
      volumeLog: [{ label: "2", startedAt: "", completedAt: "2026-07-02" }],
    };
    const volume = {
      ...timelineItem(2), title: "Volume work", mediaType: "novel", unit: "volume",
      status: "ongoing", completedAt: "",
      volumeLog: [{ label: "3", startedAt: "", completedAt: "2026-07-03" }],
    };

    legacyTest.TimelineUI.render(container, [chapter, season, volume], { maxStackDepth: 3 });

    assert.deepEqual(
      descendantsByClass(container, "al-timeline-volume-label").map((label) => label.textContent),
      ["第 10 話", "第 2 季", "第 3 卷"],
    );
  });

''')
test_file.write_text(test_text.replace(marker, unit_test + marker, 1), encoding="utf-8")

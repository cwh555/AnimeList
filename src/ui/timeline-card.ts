import type { TimelineMediaEntry } from "../types";
import { formatTimelineDate } from "../domain/timeline/layout";
import { uiText } from "../ui-text";
import { makeEl } from "./ui-helpers";

export const TIMELINE_CARD_GEOMETRY = Object.freeze({
  width: 120,
  coverHeight: 180,
  cardHeight: 180,
  gapX: 16,
  gapY: 18,
  stemGap: 44,
});

export function createTimelinePosterCard(
  item: TimelineMediaEntry,
  options: {
    time: number;
    className?: string;
    openFile: (path: string) => void | Promise<void>;
  },
): HTMLButtonElement {
  const card = makeEl("button", options.className ?? "al-timeline-card");
  card.type = "button";
  card.title = uiText("timeline.cardTitle", { title: item.title, date: formatTimelineDate(options.time) });

  if (item.cover) {
    const image = makeEl("img", "", "");
    image.src = item.cover;
    image.alt = uiText("timeline.coverAlt", { title: item.title });
    card.appendChild(image);
  }

  card.appendChild(makeEl("span", "al-cover-shade"));
  const text = makeEl("span", "al-timeline-card-copy al-cover-bottom");
  text.appendChild(makeEl("strong", "", item.seriesTitle || item.title));
  if (item.volumeLabel) {
    text.appendChild(makeEl(
      "span",
      "al-timeline-volume-label",
      item.serialEntryLabel || uiText("timeline.volumeLabel", { volume: item.volumeLabel }),
    ));
  }
  card.appendChild(text);

  if (item.score != null) card.appendChild(makeEl("span", "al-timeline-score", `★ ${Number(item.score).toFixed(1)}`));
  card.addEventListener("click", () => { void options.openFile(item.filePath); });
  return card;
}

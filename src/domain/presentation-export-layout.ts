import type { PresentationDocument, PresentationEntry } from "./presentation-export";
import { SCORE_DASHBOARD_THUMBNAIL_WIDTH, SCORE_DASHBOARD_THUMBNAIL_HEIGHT } from "./score-dashboard/model";

export const PRESENTATION_IMAGE_WIDTH = 1000;
export const PRESENTATION_IMAGE_MAX_HEIGHT = 2600;
export const PRESENTATION_IMAGE_PIXEL_RATIO = 1.5;
export const PRESENTATION_IMAGE_MAX_PIXELS = 8_000_000;

export interface PresentationPlacement {
  entry: PresentationEntry;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PresentationPageSection {
  label: string;
  y: number;
  height: number;
  cards: PresentationPlacement[];
}
export interface PresentationPage {
  width: number;
  height: number;
  index: number;
  sections: PresentationPageSection[];
}
export interface PresentationPagePlan {
  pages: PresentationPage[];
  pixelRatio: number;
}
export const PRESENTATION_MARGIN = 24;
export const PRESENTATION_HEADER_HEIGHT = 114;
export const PRESENTATION_FOOTER_HEIGHT = 30;
export const PRESENTATION_SCORE_LABEL_WIDTH = 88;
const CARD_GAP = 10;
const SECTION_GAP = 12;
const SCORE_PADDING = 12;
const EMPTY_SCORE_LANE_HEIGHT = 76;
// Use exactly the same 2:3 cover geometry as the Scoreboard at a readable export scale.
export const PRESENTATION_POSTER_WIDTH = Math.round(SCORE_DASHBOARD_THUMBNAIL_WIDTH * 1.42);
export const PRESENTATION_POSTER_HEIGHT = Math.round(SCORE_DASHBOARD_THUMBNAIL_HEIGHT * 1.42);
const RANK_WIDTH = 222;
const RANK_HEIGHT = 148;

export function planPresentationPages(
  document: PresentationDocument,
  maxHeight = PRESENTATION_IMAGE_MAX_HEIGHT,
): PresentationPagePlan {
  const isRanking = document.kind === "ranking";
  const cardWidth = isRanking ? RANK_WIDTH : PRESENTATION_POSTER_WIDTH;
  const cardHeight = isRanking ? RANK_HEIGHT : PRESENTATION_POSTER_HEIGHT;
  const labelWidth = isRanking ? 0 : PRESENTATION_SCORE_LABEL_WIDTH;
  const contentX = PRESENTATION_MARGIN + labelWidth + SCORE_PADDING;
  const columns = Math.max(1, Math.floor(
    (PRESENTATION_IMAGE_WIDTH - contentX - PRESENTATION_MARGIN - SCORE_PADDING + CARD_GAP)
      / (cardWidth + CARD_GAP),
  ));
  const requestedHeight = Number.isFinite(maxHeight) ? maxHeight : PRESENTATION_IMAGE_MAX_HEIGHT;
  const availableHeight = Math.max(
    PRESENTATION_HEADER_HEIGHT + cardHeight + 2 * SCORE_PADDING + PRESENTATION_FOOTER_HEIGHT,
    Math.min(requestedHeight, PRESENTATION_IMAGE_MAX_HEIGHT),
  );
  const pages: PresentationPage[] = [];
  let sections: PresentationPageSection[] = [];
  let y = PRESENTATION_HEADER_HEIGHT;
  const flush = (): void => {
    const used = Math.min(availableHeight, y + PRESENTATION_FOOTER_HEIGHT);
    pages.push({ width: PRESENTATION_IMAGE_WIDTH, height: used, index: pages.length, sections });
    sections = [];
    y = PRESENTATION_HEADER_HEIGHT;
  };
  for (const section of document.sections) {
    if (!isRanking && section.entries.length === 0) {
      if (y + EMPTY_SCORE_LANE_HEIGHT + PRESENTATION_FOOTER_HEIGHT > availableHeight && sections.length) {
        flush();
      }
      sections.push({ label: section.label, y, height: EMPTY_SCORE_LANE_HEIGHT, cards: [] });
      y += EMPTY_SCORE_LANE_HEIGHT + SECTION_GAP;
      continue;
    }
    let offset = 0;
    while (offset < section.entries.length) {
      const headingHeight = isRanking ? 40 : 0;
      const minimum = headingHeight + cardHeight + 2 * SCORE_PADDING;
      if (y + minimum + PRESENTATION_FOOTER_HEIGHT > availableHeight && sections.length) flush();
      const usableHeight = availableHeight - y - headingHeight - 2 * SCORE_PADDING - PRESENTATION_FOOTER_HEIGHT;
      const availableRows = Math.max(1, Math.floor((usableHeight + CARD_GAP) / (cardHeight + CARD_GAP)));
      const count = Math.min(section.entries.length - offset, availableRows * columns);
      const cards = section.entries.slice(offset, offset + count).map((entry, index) => ({
        entry,
        x: contentX + (index % columns) * (cardWidth + CARD_GAP),
        y: y + headingHeight + SCORE_PADDING + Math.floor(index / columns) * (cardHeight + CARD_GAP),
        width: cardWidth,
        height: cardHeight,
      }));
      const height = headingHeight + 2 * SCORE_PADDING
        + Math.ceil(count / columns) * cardHeight
        + (Math.ceil(count / columns) - 1) * CARD_GAP;
      sections.push({ label: offset ? `${section.label} (continued)` : section.label, y, height, cards });
      y += height + SECTION_GAP;
      offset += count;
      if (offset < section.entries.length) flush();
    }
  }
  if (!pages.length || sections.length) flush();
  return { pages, pixelRatio: PRESENTATION_IMAGE_PIXEL_RATIO };
}

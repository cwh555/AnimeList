import type { PresentationDocument, PresentationEntry } from "./presentation-export";

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
const MARGIN = 26;
const HEADER = 128;
const SECTION_HEADER = 47;
const FOOTER = 36;
const CARD_GAP = 12;
const POSTER_WIDTH = 74;
const POSTER_HEIGHT = 110;
const RANK_WIDTH = 222;
const RANK_HEIGHT = 148;

export function planPresentationPages(
  document: PresentationDocument,
  maxHeight = PRESENTATION_IMAGE_MAX_HEIGHT,
): PresentationPagePlan {
  const availableHeight = Math.max(HEADER + SECTION_HEADER + RANK_HEIGHT + FOOTER + MARGIN, Math.min(maxHeight, PRESENTATION_IMAGE_MAX_HEIGHT));
  const isRanking = document.kind === "ranking";
  const cardWidth = isRanking ? RANK_WIDTH : POSTER_WIDTH;
  const cardHeight = isRanking ? RANK_HEIGHT : POSTER_HEIGHT;
  const columns = Math.max(1, Math.floor((PRESENTATION_IMAGE_WIDTH - 2 * MARGIN + CARD_GAP) / (cardWidth + CARD_GAP)));
  const pages: PresentationPage[] = [];
  let sections: PresentationPageSection[] = [];
  let y = HEADER;
  const flush = (): void => {
    pages.push({ width: PRESENTATION_IMAGE_WIDTH, height: Math.min(availableHeight, y + FOOTER), index: pages.length, sections });
    sections = [];
    y = HEADER;
  };
  for (const section of document.sections) {
    let offset = 0;
    while (offset < section.entries.length) {
      if (y + SECTION_HEADER + cardHeight + FOOTER > availableHeight && sections.length) flush();
      const availableRows = Math.max(1, Math.floor((availableHeight - y - SECTION_HEADER - FOOTER + CARD_GAP) / (cardHeight + CARD_GAP)));
      const count = Math.min(section.entries.length - offset, availableRows * columns);
      const cards = section.entries.slice(offset, offset + count).map((entry, index) => ({
        entry,
        x: MARGIN + (index % columns) * (cardWidth + CARD_GAP),
        y: y + SECTION_HEADER + Math.floor(index / columns) * (cardHeight + CARD_GAP),
        width: cardWidth,
        height: cardHeight,
      }));
      sections.push({ label: offset ? `${section.label} (continued)` : section.label, y, cards });
      y += SECTION_HEADER + Math.ceil(count / columns) * (cardHeight + CARD_GAP) + 16;
      offset += count;
      if (offset < section.entries.length) flush();
    }
  }
  if (!pages.length || sections.length) flush();
  return { pages, pixelRatio: PRESENTATION_IMAGE_PIXEL_RATIO };
}

import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import type { PresentationDocument } from "../domain/presentation-export";
import {
  planPresentationPages, PRESENTATION_MARGIN, PRESENTATION_SCORE_LABEL_WIDTH,
  type PresentationPage, type PresentationPlacement,
} from "../domain/presentation-export-layout";
import { scoreDashboardColor } from "../domain/score-dashboard/color";
import { decodeRasterImage, encodeCanvasImage } from "../data/image-raster";
import { readPresentationCover } from "../data/presentation-cover-service";
import { scoreDashboardText } from "../features/score-dashboard/text";
import { libraryExportText } from "../features/library-export/text";

export type PresentationTheme = "light" | "dark";
export interface PresentationRasterResult {
  pages: Blob[];
  missingCovers: number;
  dimensions: { width: number; maxHeight: number };
}
interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
}
const FALLBACK_PALETTES: Record<PresentationTheme, Palette> = {
  light: {
    background: "#f3f4f7", surface: "#ffffff", surfaceAlt: "#f7f7fa",
    foreground: "#252733", muted: "#646779", border: "#d9dae2", accent: "#7453aa",
  },
  dark: {
    background: "#1e1e23", surface: "#26262e", surfaceAlt: "#2d2d37",
    foreground: "#eaeaf0", muted: "#a7a7b4", border: "#41414b", accent: "#ad91d5",
  },
};

/** Sample Obsidian's semantic tokens when the requested theme is active. */
function palette(theme: PresentationTheme): Palette {
  const fallback = FALLBACK_PALETTES[theme];
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const currentTheme = document.body.classList.contains("theme-light") ? "light"
    : document.body.classList.contains("theme-dark") ? "dark" : null;
  if (currentTheme !== theme) return fallback;
  const style = getComputedStyle(document.body);
  const value = (name: string, fallbackValue: string) => style.getPropertyValue(name).trim() || fallbackValue;
  return {
    background: value("--background-primary", fallback.background),
    surface: value("--background-secondary", fallback.surface),
    surfaceAlt: value("--background-primary-alt", fallback.surfaceAlt),
    foreground: value("--text-normal", fallback.foreground),
    muted: value("--text-muted", fallback.muted),
    border: value("--background-modifier-border", fallback.border),
    accent: value("--interactive-accent", fallback.accent),
  };
}
function lineText(
  ctx: CanvasRenderingContext2D, content: string, x: number, y: number,
  limit: number, size = 15, bold = false,
): void {
  ctx.font = `${bold ? "700" : "400"} ${size}px system-ui, -apple-system, "Noto Sans CJK TC", sans-serif`;
  let value = content;
  if (ctx.measureText(value).width > limit) {
    while (value.length && ctx.measureText(value + "…").width > limit) value = value.slice(0, -1);
    value += "…";
  }
  ctx.fillText(value, x, y);
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, radius = 11): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}
function missingCover(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Palette): void {
  rounded(ctx, x, y, w, h, p.surfaceAlt, 5);
  ctx.save();
  ctx.strokeStyle = p.muted;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  const cx = x + w / 2, cy = y + h / 2;
  const size = Math.min(w / 3, 24);
  ctx.strokeRect(cx - size, cy - size * 0.8, size * 2, size * 1.6);
  ctx.beginPath();
  ctx.moveTo(cx - size + 5, cy + size * 0.55);
  ctx.lineTo(cx - 2, cy - 3);
  ctx.lineTo(cx + 5, cy + 4);
  ctx.lineTo(cx + size - 4, cy - size * 0.4);
  ctx.stroke();
  ctx.restore();
}
async function drawCover(
  ctx: CanvasRenderingContext2D, host: AnimeListFeatureHost, item: MediaItem,
  x: number, y: number, w: number, h: number, p: Palette,
): Promise<boolean> {
  const asset = await readPresentationCover(host, item);
  if (!asset) {
    missingCover(ctx, x, y, w, h, p);
    return false;
  }
  try {
    const image = await decodeRasterImage(asset.data, asset.contentType);
    try {
      if (image.width <= 0 || image.height <= 0) throw new Error("Invalid cover dimensions");
      const factor = Math.max(w / image.width, h / image.height);
      const sw = w / factor, sh = h / factor;
      ctx.save();
      try {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5);
        ctx.clip();
        ctx.drawImage(
          image.source, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh,
          x, y, w, h,
        );
      } finally {
        ctx.restore();
      }
    } finally {
      image.close();
    }
    return true;
  } catch {
    missingCover(ctx, x, y, w, h, p);
    return false;
  }
}
function typeLabel(type: PresentationDocument["mediaType"]): string {
  return type === "all" ? scoreDashboardText.all
    : type === "anime" ? scoreDashboardText.anime
      : type === "manga" ? scoreDashboardText.manga : scoreDashboardText.novel;
}
function drawFrame(
  ctx: CanvasRenderingContext2D, page: PresentationPage,
  exportData: PresentationDocument, theme: PresentationTheme, totalPages: number,
): Palette {
  const p = palette(theme);
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = p.accent;
  lineText(ctx, "ANIMELIST", PRESENTATION_MARGIN, 28, 340, 12, true);
  ctx.fillStyle = p.foreground;
  lineText(ctx, exportData.kind === "scoreboard"
    ? scoreDashboardText.title : libraryExportText("presentationRanking"),
    PRESENTATION_MARGIN, 65, 700, 29, true);
  ctx.fillStyle = p.muted;
  lineText(ctx, `${typeLabel(exportData.mediaType)}  ·  ${exportData.total} ${scoreDashboardText.works}`,
    PRESENTATION_MARGIN, 92, 780, 13);
  if (totalPages > 1) {
    ctx.textAlign = "right";
    lineText(ctx, `${page.index + 1} / ${totalPages}`,
      page.width - PRESENTATION_MARGIN, 92, 120, 13, true);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = p.border;
  ctx.fillRect(PRESENTATION_MARGIN, 103, page.width - 2 * PRESENTATION_MARGIN, 1);
  ctx.fillStyle = p.muted;
  ctx.textAlign = "right";
  lineText(ctx, "AnimeList", page.width - PRESENTATION_MARGIN, page.height - 11, 240, 11);
  ctx.textAlign = "left";
  return p;
}
function drawScoreSection(
  ctx: CanvasRenderingContext2D, section: PresentationPage["sections"][number], p: Palette,
): void {
  const x = PRESENTATION_MARGIN, w = 1000 - 2 * PRESENTATION_MARGIN;
  rounded(ctx, x, section.y, w, section.height, p.surface, 11);
  const color = /^\d+(?:\.\d+)?$/.test(section.label)
    ? scoreDashboardColor(Number(section.label)) : p.muted;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, section.y, w, section.height, 11);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, section.y, PRESENTATION_SCORE_LABEL_WIDTH, section.height);
  ctx.globalAlpha = 0.055;
  ctx.fillRect(x + PRESENTATION_SCORE_LABEL_WIDTH, section.y,
    w - PRESENTATION_SCORE_LABEL_WIDTH, section.height);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  lineText(ctx, section.label, x + PRESENTATION_SCORE_LABEL_WIDTH / 2,
    section.y + section.height / 2 - 2, PRESENTATION_SCORE_LABEL_WIDTH - 8, 22, true);
  lineText(ctx, String(section.cards.length), x + PRESENTATION_SCORE_LABEL_WIDTH / 2,
    section.y + section.height / 2 + 22, PRESENTATION_SCORE_LABEL_WIDTH - 8, 12);
  ctx.textAlign = "left";
  if (section.cards.length === 0) {
    ctx.fillStyle = p.muted;
    lineText(ctx, scoreDashboardText.emptyLane,
      x + PRESENTATION_SCORE_LABEL_WIDTH + 20,
      section.y + section.height / 2 + 5,
      w - PRESENTATION_SCORE_LABEL_WIDTH - 40, 14);
  }
}
function drawRankingSection(
  ctx: CanvasRenderingContext2D, section: PresentationPage["sections"][number], p: Palette,
): void {
  ctx.fillStyle = p.foreground;
  lineText(ctx, section.label, PRESENTATION_MARGIN, section.y + 28, 720, 17, true);
  ctx.fillStyle = p.border;
  ctx.fillRect(PRESENTATION_MARGIN, section.y + 37, 1000 - 2 * PRESENTATION_MARGIN, 1);
}
function drawRankingCardText(
  ctx: CanvasRenderingContext2D, title: string, x: number, y: number, maxWidth: number,
): void {
  const chars = Array.from(title);
  ctx.font = '600 13px system-ui, "Noto Sans CJK TC", sans-serif';
  let first = "";
  while (chars.length && ctx.measureText(first + chars[0]).width <= maxWidth) first += chars.shift();
  let second = chars.join("");
  while (second.length && ctx.measureText(second + "…").width > maxWidth) second = second.slice(0, -1);
  if (second.length < chars.length) second += "…";
  ctx.fillText(first, x, y);
  if (second) ctx.fillText(second, x, y + 18);
}
async function drawCard(
  ctx: CanvasRenderingContext2D, host: AnimeListFeatureHost,
  placement: PresentationPlacement, kind: PresentationDocument["kind"], p: Palette,
): Promise<boolean> {
  const { x, y, width: w, height: h, entry } = placement;
  if (kind === "scoreboard") {
    rounded(ctx, x - 1, y - 1, w + 2, h + 2, p.border, 6);
    return drawCover(ctx, host, entry.item, x, y, w, h, p);
  }
  rounded(ctx, x, y, w, h, p.surface, 9);
  const coverWidth = 84, coverHeight = 126;
  const loaded = await drawCover(ctx, host, entry.item, x + 10, y + 11, coverWidth, coverHeight, p);
  ctx.fillStyle = p.accent;
  lineText(ctx, entry.badge, x + 103, y + 34, w - 113, 16, true);
  ctx.fillStyle = p.foreground;
  drawRankingCardText(ctx, entry.item.title, x + 103, y + 63, w - 113);
  return loaded;
}

/** Single page at a time; decoded cover bitmaps are immediately released. */
export async function rasterizePresentation(
  host: AnimeListFeatureHost,
  exportData: PresentationDocument,
  theme: PresentationTheme,
): Promise<PresentationRasterResult> {
  const plan = planPresentationPages(exportData);
  const pages: Blob[] = [];
  let missingCovers = 0;
  let maxHeight = 0;
  for (const page of plan.pages) {
    const canvas = createEl("canvas");
    canvas.width = Math.ceil(page.width * plan.pixelRatio);
    canvas.height = Math.ceil(page.height * plan.pixelRatio);
    maxHeight = Math.max(maxHeight, canvas.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    try {
      ctx.scale(plan.pixelRatio, plan.pixelRatio);
      const p = drawFrame(ctx, page, exportData, theme, plan.pages.length);
      for (const section of page.sections) {
        if (exportData.kind === "scoreboard") drawScoreSection(ctx, section, p);
        else drawRankingSection(ctx, section, p);
        for (const placement of section.cards) {
          if (!(await drawCard(ctx, host, placement, exportData.kind, p))) missingCovers += 1;
        }
      }
      pages.push(await encodeCanvasImage(canvas, "image/png"));
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
  return {
    pages, missingCovers,
    dimensions: { width: Math.ceil(plan.pages[0].width * plan.pixelRatio), maxHeight },
  };
}

import { TFile } from "obsidian";
import { normalizedCoverPath } from "../domain/value-normalization";
import type { AnimeListFeatureHost } from "../app/feature-types";
import type { MediaItem } from "../domain/media-types";
import type { PresentationDocument } from "../domain/presentation-export";
import { planPresentationPages, type PresentationPage, type PresentationPlacement } from "../domain/presentation-export-layout";
import { decodeRasterImage, encodeCanvasImage } from "../data/image-raster";

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
function palette(theme: PresentationTheme): Palette {
  return theme === "dark"
    ? { background: "#151922", surface: "#232a37", surfaceAlt: "#2c3544", foreground: "#f1f4f9", muted: "#a7b4c9", border: "#435064", accent: "#90b9fc" }
    : { background: "#f8fafc", surface: "#ffffff", surfaceAlt: "#ecf0f6", foreground: "#172238", muted: "#516078", border: "#d2dbe6", accent: "#305d9f" };
}
function text(
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
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
}
function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Palette): void {
  rounded(ctx, x, y, w, h, p.surfaceAlt);
  ctx.fillStyle = p.muted;
  ctx.textAlign = "center";
  text(ctx, "No cover", x + w / 2, y + h / 2, w - 4, 11);
  ctx.textAlign = "left";
}
async function drawCover(
  ctx: CanvasRenderingContext2D,
  host: AnimeListFeatureHost,
  item: MediaItem,
  x: number, y: number, w: number, h: number,
  p: Palette,
): Promise<boolean> {
  const reference = normalizedCoverPath(item.cover);
  const file = reference && !/^https?:\/\//i.test(reference)
    ? (host.app.metadataCache.getFirstLinkpathDest(reference, item.filePath)
      ?? host.app.vault.getAbstractFileByPath(reference))
    : null;
  if (!(file instanceof TFile)) {
    placeholder(ctx, x, y, w, h, p);
    return false;
  }
  try {
    const bytes = await host.app.vault.readBinary(file);
    const image = await decodeRasterImage(bytes);
    try {
      const factor = Math.max(w / image.width, h / image.height);
      const sw = w / factor;
      const sh = h / factor;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.clip();
      ctx.drawImage(image.source, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
      ctx.restore();
    } finally {
      image.close();
    }
    return true;
  } catch {
    // Broken local artwork must not prevent exporting the text and other covers.
    placeholder(ctx, x, y, w, h, p);
    return false;
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D, page: PresentationPage,
  document: PresentationDocument, theme: PresentationTheme, totalPages: number,
): Palette {
  const p = palette(theme);
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = p.accent;
  text(ctx, "ANIMELIST", 26, 32, 400, 13, true);
  ctx.fillStyle = p.foreground;
  text(ctx, document.kind === "ranking" ? "Ranking" : "Scoreboard", 26, 76, 560, 32, true);
  ctx.fillStyle = p.muted;
  text(ctx, `${document.mediaType}  ·  ${document.total} works  ·  ${page.index + 1}/${totalPages}`, 26, 104, 950, 14);
  ctx.fillStyle = p.border;
  ctx.fillRect(26, 116, page.width - 52, 1);
  for (const section of page.sections) {
    ctx.fillStyle = p.foreground;
    text(ctx, section.label, 26, section.y + 29, page.width - 52, 19, true);
    ctx.fillStyle = p.border;
    ctx.fillRect(26, section.y + 40, page.width - 52, 1);
  }
  ctx.fillStyle = p.muted;
  text(ctx, `AnimeList · Page ${page.index + 1} / ${totalPages}`, 26, page.height - 14, page.width - 52, 11);
  return p;
}
async function drawCard(
  ctx: CanvasRenderingContext2D, host: AnimeListFeatureHost,
  placement: PresentationPlacement, kind: PresentationDocument["kind"], p: Palette,
): Promise<boolean> {
  const { x, y, width: w, height: h, entry } = placement;
  if (kind === "scoreboard") return drawCover(ctx, host, entry.item, x, y, w, h, p);
  rounded(ctx, x, y, w, h, p.surface);
  const coverWidth = 87, coverHeight = 124;
  const loaded = await drawCover(ctx, host, entry.item, x + 10, y + 11, coverWidth, coverHeight, p);
  ctx.fillStyle = p.accent;
  text(ctx, entry.badge, x + 106, y + 35, w - 115, 17, true);
  ctx.fillStyle = p.foreground;
  const title = entry.item.title;
  text(ctx, title, x + 106, y + 62, w - 115, 12, true);
  // Second line is intentionally absent when the title fits the first.
  return loaded;
}

/** Pages are encoded sequentially, and decoded covers are closed immediately. */
export async function rasterizePresentation(
  host: AnimeListFeatureHost,
  document: PresentationDocument,
  theme: PresentationTheme,
): Promise<PresentationRasterResult> {
  const plan = planPresentationPages(document);
  const pages: Blob[] = [];
  let missingCovers = 0;
  let maxHeight = 0;
  for (const page of plan.pages) {
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(page.width * plan.pixelRatio);
    canvas.height = Math.ceil(page.height * plan.pixelRatio);
    maxHeight = Math.max(maxHeight, canvas.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    try {
      ctx.scale(plan.pixelRatio, plan.pixelRatio);
      const p = drawFrame(ctx, page, document, theme, plan.pages.length);
      for (const section of page.sections) {
        for (const placement of section.cards) {
          if (!(await drawCard(ctx, host, placement, document.kind, p))) missingCovers += 1;
        }
      }
      pages.push(await encodeCanvasImage(canvas, "image/png"));
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
  return { pages, missingCovers, dimensions: { width: Math.ceil(plan.pages[0].width * plan.pixelRatio), maxHeight } };
}

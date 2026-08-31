import type { ImageSectionLocator } from "../domain/image-section";
import {
  planImageSectionPathMove,
  type ImageSectionDropPlacement,
} from "../domain/image-section-order";
import {
  type ImageSectionMoveOutcome,
  type ImageSectionOrderParticipant,
  ImageSectionOrderSession,
} from "./image-section-order-session";

export type { ImageSectionMoveOutcome } from "./image-section-order-session";

export interface ImageSectionMoveParticipant extends ImageSectionOrderParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  canonicalPaths(): readonly string[];
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  ownsContainer(): boolean;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
  layoutMotion(): Promise<void>;
  setDragSource?(active: boolean): void;
}

export interface ImageSectionMovePreviewRequest {
  source: ImageSectionMoveParticipant;
  target: ImageSectionMoveParticipant;
  path: string;
  targetPath: string | null;
  placement: ImageSectionDropPlacement;
}

export interface ImageSectionMoveRequest extends ImageSectionMovePreviewRequest {
  orderSession: ImageSectionOrderSession;
}

interface SameSectionMovePreview {
  pathsBefore: string[];
  pathsPreview: string[];
}

const sameSectionMovePreviews = new WeakMap<ImageSectionMoveParticipant, SameSectionMovePreview>();

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

export function previewImageSectionAssetMove(request: ImageSectionMovePreviewRequest): void {
  const { source, target, path, targetPath, placement } = request;
  if (source.sourcePath !== target.sourcePath || source !== target) return;

  const existing = sameSectionMovePreviews.get(source);
  const pathsBefore = existing ? [...existing.pathsBefore] : [...source.paths()];
  const plan = planImageSectionPathMove(
    pathsBefore,
    pathsBefore,
    path,
    targetPath ?? "",
    placement,
    true,
  );

  if (!plan.changed) {
    if (existing) {
      source.applyPaths(pathsBefore, true);
      sameSectionMovePreviews.delete(source);
    }
    return;
  }
  if (existing && samePaths(existing.pathsPreview, plan.targetPaths)) return;

  source.applyPaths(plan.targetPaths, false);
  sameSectionMovePreviews.set(source, {
    pathsBefore,
    pathsPreview: [...plan.targetPaths],
  });
}

export function clearImageSectionAssetMovePreview(
  source: ImageSectionMoveParticipant,
  target: ImageSectionMoveParticipant,
): void {
  if (source !== target) return;
  const preview = sameSectionMovePreviews.get(source);
  if (!preview) return;
  sameSectionMovePreviews.delete(source);
  source.applyPaths(preview.pathsBefore, true);
}

export async function moveImageSectionAsset(request: ImageSectionMoveRequest): Promise<ImageSectionMoveOutcome> {
  const { orderSession, source, target, path, targetPath, placement } = request;
  if (source.sourcePath !== target.sourcePath) return { status: "unsupported" };

  const sameSection = source === target;
  const preview = sameSection ? sameSectionMovePreviews.get(source) : undefined;
  const sourceBefore = preview ? [...preview.pathsBefore] : [...source.paths()];
  const targetBefore = sameSection ? sourceBefore : [...target.paths()];
  const plan = planImageSectionPathMove(
    sourceBefore,
    targetBefore,
    path,
    targetPath ?? "",
    placement,
    sameSection,
  );

  if (sameSection) sameSectionMovePreviews.delete(source);
  if (!plan.changed) {
    if (preview && !samePaths(source.paths(), sourceBefore)) source.applyPaths(sourceBefore, true);
    return { status: "unchanged" };
  }

  source.applyPaths(plan.sourcePaths, true);
  if (!sameSection) target.applyPaths(plan.targetPaths, false);
  const layout = (async () => {
    await source.layoutMotion();
    if (!sameSection) await target.layoutMotion();
  })();
  const persisted = orderSession.recordMove({
    source,
    target,
    sourceAfter: plan.sourcePaths,
    targetAfter: plan.targetPaths,
    sameSection,
  });
  const [outcome] = await Promise.all([persisted, layout]);
  return outcome;
}

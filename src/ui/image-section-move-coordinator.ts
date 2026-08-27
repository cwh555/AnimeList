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

export interface ImageSectionMoveRequest {
  orderSession: ImageSectionOrderSession;
  source: ImageSectionMoveParticipant;
  target: ImageSectionMoveParticipant;
  path: string;
  targetPath: string | null;
  placement: ImageSectionDropPlacement;
}

export async function moveImageSectionAsset(request: ImageSectionMoveRequest): Promise<ImageSectionMoveOutcome> {
  const { orderSession, source, target, path, targetPath, placement } = request;
  if (source.sourcePath !== target.sourcePath) return { status: "unsupported" };

  const sameSection = source === target;
  const sourceBefore = [...source.paths()];
  const targetBefore = sameSection ? sourceBefore : [...target.paths()];
  const plan = planImageSectionPathMove(
    sourceBefore,
    targetBefore,
    path,
    targetPath ?? "",
    placement,
    sameSection,
  );

  if (!plan.changed) return { status: "unchanged" };

  source.applyPaths(plan.sourcePaths, sameSection);
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

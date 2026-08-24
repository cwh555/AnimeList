import type { ImageSectionService } from "../data/image-section-service";
import type { ImageSectionLocator } from "../domain/image-section";
import {
  planImageSectionPathMove,
  type ImageSectionDropPlacement,
  type ImageSectionStateUpdate,
} from "../domain/image-section-order";
import { withImageSectionHostContinuity } from "./image-section-continuity";
import { captureScrollPosition } from "./viewport-anchor";

export interface ImageSectionMoveParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  ownsContainer(): boolean;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
  applyState(update: ImageSectionStateUpdate): void;
  preserveLayoutAcrossRefresh(): void;
  layoutMotion(): Promise<void>;
  setDragSource(active: boolean): void;
}

export type ImageSectionMoveOutcome =
  | { status: "moved" }
  | { status: "unchanged" }
  | { status: "unsupported" }
  | { status: "failed"; error: unknown };

export interface ImageSectionMoveRequest {
  service: ImageSectionService;
  source: ImageSectionMoveParticipant;
  target: ImageSectionMoveParticipant;
  path: string;
  targetPath: string | null;
  placement: ImageSectionDropPlacement;
}

export async function moveImageSectionAsset(request: ImageSectionMoveRequest): Promise<ImageSectionMoveOutcome> {
  const { service, source, target, path, targetPath, placement } = request;
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

  if (!plan.changed) {
    source.setDragSource(false);
    return { status: "unchanged" };
  }

  source.applyPaths(plan.sourcePaths, sameSection);
  if (!sameSection) target.applyPaths(plan.targetPaths, false);

  const scrollPosition = captureScrollPosition(source.containerEl);
  source.preserveLayoutAcrossRefresh();
  if (!sameSection) target.preserveLayoutAcrossRefresh();
  scrollPosition.stabilize(12);
  await Promise.all([source.layoutMotion(), sameSection ? Promise.resolve() : target.layoutMotion()]);

  const sourceLocator = source.locator();
  const targetLocator = target.locator();
  const continuitySlots = sameSection
    ? [{
      container: source.containerEl,
      sourcePath: source.sourcePath,
      expectedPaths: plan.sourcePaths,
      lineStart: sourceLocator.lineStart,
    }]
    : [
      {
        container: source.containerEl,
        sourcePath: source.sourcePath,
        expectedPaths: plan.sourcePaths,
        lineStart: sourceLocator.lineStart,
      },
      {
        container: target.containerEl,
        sourcePath: target.sourcePath,
        expectedPaths: plan.targetPaths,
        lineStart: targetLocator.lineStart,
      },
    ];

  try {
    const update = await withImageSectionHostContinuity(continuitySlots, () => service.moveAsset(
      target.sourcePath,
      sourceLocator,
      targetLocator,
      path,
      targetPath ?? "",
      placement,
    ));

    if (source.ownsContainer()) source.setDragSource(false);
    if (sameSection) {
      if (target.ownsContainer()) target.applyState(update.sourceSection);
    } else {
      if (source.ownsContainer()) source.applyState(update.sourceSection);
      if (target.ownsContainer()) target.applyState(update.targetSection);
    }
    if (source.ownsContainer()) {
      scrollPosition.restore();
      scrollPosition.stabilize(12);
    }
    return { status: "moved" };
  } catch (error) {
    if (source.ownsContainer()) source.applyPaths(sourceBefore);
    if (!sameSection && target.ownsContainer()) target.applyPaths(targetBefore);
    if (source.ownsContainer()) {
      scrollPosition.restore();
      scrollPosition.stabilize(12);
    }
    return { status: "failed", error };
  }
}

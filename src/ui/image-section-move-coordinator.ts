import type { ImageSectionService } from "../data/image-section-service";
import type { ImageSectionLocator } from "../domain/image-section";
import {
  planImageSectionPathMove,
  type ImageSectionDropPlacement,
  type ImageSectionStateUpdate,
} from "../domain/image-section-order";
import {
  queueImageSectionMoveCommit,
  type ImageSectionCommitParticipant,
  type ImageSectionMoveOutcome,
} from "./image-section-move-commit-queue";

export type { ImageSectionMoveOutcome } from "./image-section-move-commit-queue";

export interface ImageSectionMoveParticipant extends ImageSectionCommitParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  ownsContainer(): boolean;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
  applyState(update: ImageSectionStateUpdate): void;
  preserveLayoutAcrossRefresh(): void;
  layoutMotion(): Promise<void>;
  setDragSource?(active: boolean): void;
}

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

  if (!plan.changed) return { status: "unchanged" };

  source.applyPaths(plan.sourcePaths, sameSection);
  if (!sameSection) target.applyPaths(plan.targetPaths, false);
  source.preserveLayoutAcrossRefresh();
  if (!sameSection) target.preserveLayoutAcrossRefresh();
  const layout: Promise<void> = (async () => {
    await source.layoutMotion();
    if (!sameSection) await target.layoutMotion();
  })();

  return queueImageSectionMoveCommit({
    service,
    source,
    target,
    sourceBefore,
    targetBefore,
    sourceAfter: plan.sourcePaths,
    targetAfter: plan.targetPaths,
    sameSection,
    layout,
  });
}

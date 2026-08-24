import type { ImageSectionLocator } from "../domain/image-section";

export interface ImageSectionMoveLifecycleParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
}

export interface ImageSectionMoveLifecycleHooks {
  participantRegistered(participant: ImageSectionMoveLifecycleParticipant): void;
  interactionStarted(participant: ImageSectionMoveLifecycleParticipant): void;
  interactionEnded(participant: ImageSectionMoveLifecycleParticipant): void;
}

interface RegisteredHooks {
  owner: object;
  hooks: ImageSectionMoveLifecycleHooks;
}

const hooksByDocument = new WeakMap<Document, Map<string, RegisteredHooks>>();

export function registerImageSectionMoveLifecycleHooks(
  document: Document,
  sourcePath: string,
  owner: object,
  hooks: ImageSectionMoveLifecycleHooks,
): void {
  let byPath = hooksByDocument.get(document);
  if (!byPath) {
    byPath = new Map();
    hooksByDocument.set(document, byPath);
  }
  byPath.set(sourcePath, { owner, hooks });
}

export function unregisterImageSectionMoveLifecycleHooks(
  document: Document,
  sourcePath: string,
  owner: object,
): void {
  const byPath = hooksByDocument.get(document);
  const registered = byPath?.get(sourcePath);
  if (!byPath || registered?.owner !== owner) return;
  byPath.delete(sourcePath);
  if (byPath.size === 0) hooksByDocument.delete(document);
}

function lifecycleHooks(participant: ImageSectionMoveLifecycleParticipant): ImageSectionMoveLifecycleHooks | null {
  const container = participant.containerEl;
  const sourcePath = participant.sourcePath;
  if (!container?.ownerDocument || typeof sourcePath !== "string") return null;
  return hooksByDocument.get(container.ownerDocument)?.get(sourcePath)?.hooks ?? null;
}

export function adoptImageSectionMoveParticipant(
  participant: ImageSectionMoveLifecycleParticipant,
): void {
  lifecycleHooks(participant)?.participantRegistered(participant);
}

export function scheduleImageSectionMoveParticipantAdoption(
  participant: ImageSectionMoveLifecycleParticipant,
  signal?: AbortSignal,
): void {
  queueMicrotask(() => {
    if (signal?.aborted) return;
    adoptImageSectionMoveParticipant(participant);
  });
}

export function beginImageSectionMoveInteraction(participant: ImageSectionMoveLifecycleParticipant): void {
  lifecycleHooks(participant)?.interactionStarted(participant);
}

export function endImageSectionMoveInteraction(participant: ImageSectionMoveLifecycleParticipant): void {
  lifecycleHooks(participant)?.interactionEnded(participant);
}

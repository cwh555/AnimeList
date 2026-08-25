import type { ImageSectionLocator } from "../domain/image-section";

export interface ImageSectionMoveLifecycleParticipant {
  readonly containerEl: HTMLElement;
  readonly sourcePath: string;
  paths(): readonly string[];
  locator(): ImageSectionLocator;
  applyPaths(paths: readonly string[], renderEmpty?: boolean): void;
}

export interface ImageSectionMoveLifecycleHooks {
  participantRegistered?(participant: ImageSectionMoveLifecycleParticipant): void;
  interactionStarted?(participant: ImageSectionMoveLifecycleParticipant): void;
  interactionEnded?(participant: ImageSectionMoveLifecycleParticipant): void;
}

const hooksByDocument = new WeakMap<Document, Map<string, Map<object, ImageSectionMoveLifecycleHooks>>>();

function hooksFor(
  participant: ImageSectionMoveLifecycleParticipant,
): readonly ImageSectionMoveLifecycleHooks[] {
  const container = participant.containerEl;
  const sourcePath = participant.sourcePath;
  if (!container?.ownerDocument || typeof sourcePath !== "string") return [];
  const byPath = hooksByDocument.get(container.ownerDocument)?.get(sourcePath);
  return byPath ? [...byPath.values()] : [];
}

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
  let listeners = byPath.get(sourcePath);
  if (!listeners) {
    listeners = new Map();
    byPath.set(sourcePath, listeners);
  }
  listeners.set(owner, hooks);
}

export function unregisterImageSectionMoveLifecycleHooks(
  document: Document,
  sourcePath: string,
  owner: object,
): void {
  const byPath = hooksByDocument.get(document);
  const listeners = byPath?.get(sourcePath);
  if (!byPath || !listeners || !listeners.delete(owner)) return;
  if (listeners.size === 0) byPath.delete(sourcePath);
  if (byPath.size === 0) hooksByDocument.delete(document);
}

export function adoptImageSectionMoveParticipant(
  participant: ImageSectionMoveLifecycleParticipant,
): void {
  for (const hooks of hooksFor(participant)) hooks.participantRegistered?.(participant);
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
  for (const hooks of hooksFor(participant)) hooks.interactionStarted?.(participant);
}

export function endImageSectionMoveInteraction(participant: ImageSectionMoveLifecycleParticipant): void {
  for (const hooks of hooksFor(participant)) hooks.interactionEnded?.(participant);
}

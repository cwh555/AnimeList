export interface TimelinePan {
  x: number;
  y: number;
}

/** Centers the newest card horizontally while keeping the timeline axis vertical center. */
export function centerLatestTimelineAxis(
  viewportWidth: number,
  viewportHeight: number,
  latestCardCenterX: number,
  axisY: number,
  viewScale: number,
): TimelinePan {
  return {
    x: viewportWidth / 2 - latestCardCenterX * viewScale,
    y: viewportHeight / 2 - axisY * viewScale,
  };
}

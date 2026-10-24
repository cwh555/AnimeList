/** One score-color mapping used by the live Scoreboard and exported visuals. */
export function scoreDashboardColor(score: number): string {
  const hue = Math.round(8 + score * 26.2);
  return `hsl(${hue} 72% 62%)`;
}

export const RATING_FEATURE_TEXT = {
  adjusted: "評分 {original} 不符合 0.5 分級距，已四捨五入為 {rounded}。",
} as const;

export function ratingFeatureText(
  key: keyof typeof RATING_FEATURE_TEXT,
  variables: Record<string, string | number>,
): string {
  return RATING_FEATURE_TEXT[key].replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

import { Notice } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { ratingFeatureText } from "./text";
import {
  MAX_RATING,
  MIN_RATING,
  RATING_INCREMENT,
  formatRating,
  normalizeRating,
} from "../../domain/rating";
import { installNumberInputWheelGuard } from "../../ui/number-input-wheel-guard";

export const ratingFeature = defineFeature<AnimeListFeatureHost>({
  id: "rating",
  contributions: [{
    kind: "media-form",
    configure(context): void {
      const { fields } = context;
      fields.score.min = String(MIN_RATING);
      fields.score.max = String(MAX_RATING);
      fields.score.step = String(RATING_INCREMENT);
      context.onDispose(installNumberInputWheelGuard(fields.score));
    },
    prepareSubmit({ fields, form }): void {
      const raw = fields.score.value.trim();
      if (!raw) {
        form.score = null;
        return;
      }
      const result = normalizeRating(raw);
      if (result.kind === "invalid") return;
      form.score = result.value;
      if (!result.changed) return;
      fields.score.value = formatRating(result.value);
      new Notice(ratingFeatureText("adjusted", {
        original: result.original,
        rounded: formatRating(result.value),
      }));
    },
  }],
});

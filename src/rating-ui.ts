import { Notice } from "obsidian";
import type { AnimeListPluginHost } from "./app/plugin-host";
import { ratingFeatureText } from "./rating-feature-text";
import {
  MAX_RATING,
  MIN_RATING,
  RATING_INCREMENT,
  formatRating,
  normalizeRating,
} from "./rating";

export function installRatingUi(plugin: AnimeListPluginHost): void {
  plugin.features.registerMediaForm({
    id: "rating-half-point",
    order: -100,
    render: ({ fields }) => {
      fields.score.min = String(MIN_RATING);
      fields.score.max = String(MAX_RATING);
      fields.score.step = String(RATING_INCREMENT);
    },
    validate: ({ fields }) => {
      const input = fields.score;
      if (!input.value.trim()) return;
      const result = normalizeRating(input.value);
      if (result.kind !== "valid") return;
      const formatted = formatRating(result.value);
      if (result.changed) {
        new Notice(ratingFeatureText("adjusted", {
          original: input.value,
          rounded: formatted,
        }));
      }
      input.value = formatted;
    },
    collect: ({ fields }, form) => {
      form.score = fields.score.value;
    },
  });
}

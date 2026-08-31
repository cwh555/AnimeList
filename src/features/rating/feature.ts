import { Notice } from "obsidian";
import { defineFeature, type AnimeListFeatureHost } from "../../app/feature-types";
import { ratingFeatureText } from "./text";
import { formatRating, normalizeRating } from "../../domain/rating";
import { installRatingInputBehavior } from "../../ui/rating-input";

export const ratingFeature = defineFeature<AnimeListFeatureHost>({
  id: "rating",
  contributions: [{
    kind: "media-form",
    configure(context): void {
      context.onDispose(installRatingInputBehavior(context.fields.score));
    },
    prepareSubmit({ fields, form }): void {
      // mediaFormValues() is the authoritative snapshot. Never read the live DOM
      // again here: later UI events must not change what this submit persists.
      const result = normalizeRating(form.score);
      if (result.kind === "empty") {
        form.score = null;
        return;
      }
      if (result.kind === "invalid") return;
      form.score = result.value;
      if (result.kind !== "valid" || !result.changed) return;
      fields.score.value = formatRating(result.value);
      new Notice(ratingFeatureText("adjusted", {
        original: result.original,
        rounded: formatRating(result.value),
      }));
    },
  }],
});

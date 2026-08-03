export const TEST_SUITES = ["unit", "integration", "contract", "legacy"];

export const TEST_FEATURES = [
  "covers",
  "library",
  "markdown",
  "masterpiece",
  "progress",
  "rating",
  "release",
  "score-dashboard",
  "search",
  "serial-covers",
  "settings",
  "styles",
  "test-infrastructure",
  "test-vault",
  "text",
  "timeline",
];

export const TEST_TARGETS = [
  { path: "tests/cover-cache.test.ts", kind: "test", suite: "integration", features: ["covers"] },

  { path: "tests/masterpiece-labels.test.ts", kind: "test", suite: "unit", features: ["masterpiece"] },

  { path: "tests/media-status.test.ts", kind: "test", suite: "unit", features: ["progress"] },
  { path: "tests/progress-display.test.ts", kind: "test", suite: "unit", features: ["progress"] },
  { path: "tests/progress-units.test.ts", kind: "test", suite: "unit", features: ["progress"] },
  { path: "tests/rating.test.ts", kind: "test", suite: "unit", features: ["rating", "progress"] },
  { path: "tests/schema-migration.test.ts", kind: "test", suite: "integration", features: ["progress", "markdown"] },
  { path: "tests/segmented-date-input.test.ts", kind: "test", suite: "unit", features: ["progress"] },
  { path: "tests/serial-entry-scroll.test.ts", kind: "test", suite: "unit", features: ["progress"] },
  { path: "tests/serial-entry-keyboard-navigation.test.ts", kind: "test", suite: "unit", features: ["progress"] },

  { path: "tests/score-dashboard.test.ts", kind: "test", suite: "unit", features: ["score-dashboard", "rating"] },
  { path: "tests/score-dashboard-selection.test.ts", kind: "test", suite: "unit", features: ["score-dashboard"] },
  { path: "tests/score-dashboard-drag-scroll.test.ts", kind: "test", suite: "unit", features: ["score-dashboard"] },

  { path: "tests/duplicate-detection.test.ts", kind: "test", suite: "unit", features: ["search"] },
  { path: "tests/library-change-scope.test.ts", kind: "test", suite: "unit", features: ["library"] },
  { path: "tests/media-library-index.test.ts", kind: "test", suite: "unit", features: ["library"] },
  { path: "tests/library-navigation.test.ts", kind: "test", suite: "integration", features: ["search", "library"] },
  { path: "tests/multilingual-search.test.ts", kind: "test", suite: "unit", features: ["search"] },
  { path: "tests/search-pagination.test.ts", kind: "test", suite: "unit", features: ["search"] },
  { path: "tests/search-settings.test.ts", kind: "test", suite: "integration", features: ["search", "settings"] },

  { path: "tests/serial-entry-cover.test.ts", kind: "test", suite: "unit", features: ["serial-covers"] },
  { path: "tests/serial-cover-workflow.test.ts", kind: "test", suite: "integration", features: ["serial-covers", "timeline"] },
  { path: "tests/serial-cover-settings.test.ts", kind: "test", suite: "integration", features: ["serial-covers", "settings"] },
  { path: "tests/serial-cover-migration-modal.test.ts", kind: "test", suite: "unit", features: ["serial-covers"] },

  { path: "tests/timeline-scale.test.ts", kind: "test", suite: "integration", features: ["timeline"] },
  { path: "tests/timeline-scale-work-items.test.ts", kind: "test", suite: "unit", features: ["timeline"] },
  { path: "tests/timeline-corrections.test.ts", kind: "test", suite: "unit", features: ["timeline", "progress"] },

  { path: "tests/contracts/media-note-compatibility.test.ts", kind: "test", suite: "contract", features: ["markdown", "progress"] },
  { path: "tests/contracts/media-note-service.test.ts", kind: "test", suite: "contract", features: ["markdown", "library", "covers"] },
  { path: "tests/contracts/media-update-service.test.ts", kind: "test", suite: "contract", features: ["markdown", "progress", "library"] },
  { path: "tests/contracts/external-media-service.test.ts", kind: "test", suite: "contract", features: ["search"] },
  { path: "tests/contracts/existing-library-initialization.test.ts", kind: "test", suite: "contract", features: ["library", "markdown", "settings"] },
  { path: "tests/contracts/feature-installer.test.ts", kind: "test", suite: "contract", features: ["test-infrastructure"] },
  { path: "tests/contracts/media-repository.test.ts", kind: "test", suite: "contract", features: ["library", "markdown"] },
  { path: "tests/contracts/plugin-workflows.test.ts", kind: "test", suite: "contract", features: ["timeline", "library"] },
  { path: "tests/contracts/settings-compatibility.test.ts", kind: "test", suite: "contract", features: ["settings", "search", "masterpiece"] },
  { path: "tests/contracts/special-label-state-service.test.ts", kind: "test", suite: "contract", features: ["masterpiece", "library"] },
  { path: "tests/contracts/style-bundle.test.ts", kind: "test", suite: "contract", features: ["styles", "release", "timeline"] },
  { path: "tests/contracts/text-catalog.test.ts", kind: "test", suite: "contract", features: ["text", "settings"] },
  { path: "tests/contracts/test-catalog.test.ts", kind: "test", suite: "contract", features: ["test-infrastructure"] },
  { path: "scripts/check-architecture.mjs", kind: "script", suite: "contract", features: ["test-infrastructure"] },

  { path: "tests/legacy-characterization.test.ts", kind: "test", suite: "legacy", features: ["library", "markdown", "progress", "release", "search", "settings", "text", "timeline", "serial-covers"] },
  { path: "scripts/check-serial-reading-ui.mjs", kind: "script", suite: "legacy", features: ["progress", "serial-covers", "timeline"] },
  { path: "scripts/check-library-list-layout.mjs", kind: "script", suite: "legacy", features: ["library", "covers"] },
  { path: "scripts/check-test-vault-fixtures.mjs", kind: "script", suite: "contract", features: ["test-vault", "test-infrastructure"] },
];

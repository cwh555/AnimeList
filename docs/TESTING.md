# AnimeList test strategy

The test catalog in `tests/test-catalog.mjs` is the single source of truth for
Node test registration. Suites classify purpose; features identify affected
behavior. Historical regression tests are retained rather than deleted.

| Command | Purpose |
| --- | --- |
| `npm test` / `npm run test:smoke` | Fast deterministic smoke subset (19 targets), excluding legacy and migration suites |
| `npm run test:ui` | Tests registered with the `ui` feature |
| `npm run test:feature -- search` | All Node tests registered for a feature |
| `npm run test:unit` | All unit tests only |
| `npm run test:legacy` | Legacy characterization and historical compatibility |
| `npm run test:legacy-update` | Old-note compatibility and migration |
| `npm run test:all` | Full registered Node test and contract-script suite |
| `npm run check:quick` | Typechecks, lint, architecture, smoke suite and build |
| `npm run check` | Full strict integration gate, including all Node tests |
| `npm run test:browser:ui` | Responsive shared modal and cover picker Chromium tests |
| `npm run test-vault` | Full check and release preflight, then install production plugin into Test Vault |

Using `npm test -- --feature covers` is also supported; adding `--suite contract`
restricts it to contracts. `npm run test:list` prints all entries without
running them. `npm run test:all` is explicit and must not silently downgrade
to smoke coverage.

The legacy suites are **opt-in during routine iteration**, but still run during
`npm run check`, in CI and before handing work off for a Test Vault sign-off.
Do not replace behavior assertions with source-line or selector-text matching.
Feature-specific browser checks are separate because Chromium rendering is
not equivalent to Node unit-test coverage. Actual desktop/mobile Obsidian
interactions still require the manual checklist.

## 1.6.0 release regression coverage

The 1.6.0 candidate adds independent behavior checks for the pairwise ranking file and resumed comparison rounds, Markdown Image Section/Moments block revalidation, cover replacement, media-asset garbage collection, per-interaction search pagination, delayed Add Media navigation, provider logical deadlines, and five-locale search prompts. These tests remain registered in `tests/test-catalog.mjs` and must run as part of `npm run check`.

For full desktop/mobile interactive review, use the `AnimeList 1.6.0 release-candidate acceptance` section in [the manual checklist](MANUAL_TEST_CHECKLIST.md). Browser tests do not substitute for on-device Obsidian/Sync testing; the managed-asset cleanup and ranking adapter fallback do not provide cross-device transactional locking.

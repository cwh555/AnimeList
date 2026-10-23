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

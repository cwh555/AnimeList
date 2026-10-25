# Verification

AnimeList release candidates are verified from the exact Git commit that will be reviewed. This document describes the required verification contract instead of preserving stale timing or test-count snapshots from an older release.

## Required environment

- A clean checkout of the candidate commit.
- The Node.js version used by repository CI or another version supported by `package.json`.
- npm with the committed lockfile.
- Chromium available for the browser regression scripts when they are run outside GitHub Actions.
- A disposable Obsidian Test Vault for the final interactive checks.

## Local release-candidate checks

Run from the repository root:

```bash
npm ci
npm test
npm run check
npm run release:check
```

`npm run check` is the complete repository gate: TypeScript, strict TypeScript, lint, architecture checks, automated tests, Community preflight, reproducible styles, and the production build. `npm run release:check` verifies the currently committed release metadata and release artifacts. `package.json` is the single plugin-version source: use `npm run release:version -- <new-version>` for a release bump, or `npm run version:sync` after manually editing only `package.json`. Derived version fields must not be edited independently.

For browser-sensitive changes, also run the relevant Chromium regressions:

```bash
npm run test:browser:date
npm run test:browser:mobile
npm run test:browser:score-mobile
npm run test:browser:tags
npm run test:browser:tag-manager
```

## GitHub Actions

The final PR head must pass `.github/workflows/ci.yml` on the exact SHA being reviewed. The workflow independently runs:

```text
npm ci
TZ=UTC npm run check
TZ=Asia/Taipei npm test
segmented-date Chromium regression
responsive mobile Chromium regression
Score Dashboard mobile Chromium regression
tag-chip Chromium regression
Tag Manager Chromium regression
npm run release:check
```

A successful older SHA is not sufficient after the branch changes. If a validation-only commit is used to obtain a clean final CI run, the final reported workflow must correspond to that new head SHA.

## Community compatibility

The Community preflight must stay free of suppressions and browser-feature workarounds that exceed the minimum supported Obsidian baseline. Release CSS should avoid unsupported or partially supported features when an equivalent baseline layout exists. The current preflight explicitly protects against reintroducing CSS multi-column layout and `scrollbar-width` / `scrollbar-color` into the generated release stylesheet.

## 1.6.2 release-candidate and publication gate

This release introduces unified Library / Scoreboard / Ranking exports. Its source baseline is the `preview` squash commit `52363acc` (PR #258) plus the previous Ranking evidence fix. Confirm the **current** branch heads rather than relying on these historical SHAs when making a release decision.

1. On a dedicated preparation branch from the latest `preview`, run `npm run release:version -- 1.6.2` or perform its exact `package.json` / derived-metadata updates. Verify `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` all specify `1.6.2`. Keep `manifest.minAppVersion` at `1.5.0` and the historical README **1.6.0** major feature overview intact.
2. Review the 1.6.2 changelog, User Guide, unified Export reference, mobile/desktop checklist, and the bundled Export text labels. Confirm there are no Markdown/frontmatter or Ranking JSON changes. Use the user's Test Vault to verify Export content, real covers and multi-page mobile saving.
3. Run `npm ci`, `npm run check`, and `npm run release:check` on the preparation branch and require successful GitHub Actions on the exact PR head SHA. Only after explicit user verification and merge permission, squash-merge this preparation PR into `preview`; then independently verify the **preview push CI** for the squash commit.
4. **Do not advance `main` or create tag `1.6.2` during preparation.** After the user explicitly approves publication, refresh `main` and `preview`, require that `main` is an ancestor of the verified `preview`, and fast-forward `main` to preserve all existing source and documentation commits without another squash or merge commit.
5. Wait for successful **main push CI** on the precise new `main` SHA. The existing automated release promoter validates current `main`, exact version metadata, and tag immutability; it then creates tag `1.6.2` (no `v` prefix) and dispatches `release.yml` with `tag=1.6.2`.
6. Verify the release workflow checked out the exact tag, passed build and `release:check`, and published a public `AnimeList 1.6.2` Release with precisely `main.js`, `manifest.json`, and `styles.css`. Report tag SHA, assets, and publication status separately from Test Vault approval.

## Historical: 1.6.1 preview → main fast-forward release gate

The 1.6.1 release candidate must be reviewed and accepted in the Test Vault while on `preview`. The user must explicitly authorize publication before advancing `main`; a successful PR or `preview` CI alone is insufficient.

1. Verify `preview` contains the feature squash and version-preparation squash commits, with `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` consistently set to `1.6.1`. Keep the README's 1.6.0 major-feature overview; the patch details live in CHANGELOG and a separate README maintenance note.
2. Confirm the `preview` push-triggered CI on its exact SHA succeeds, including `npm ci`, `npm run check`, `npm run release:check`, the mobile/Ranking Chromium suites, and production Test Vault packaging. Test the real Obsidian Test Vault before granting publication approval.
3. When the user approves, fetch both branch heads and require that the current `main` is an ancestor of the verified `preview`. Advance `main` **with fast-forward only**, preserving the two `preview` squash commits and every existing `main` commit. Do not squash again, create a merge commit, or force-push shared branches.
4. Wait for the **main push CI** at exactly the fast-forwarded SHA to pass. The release-promotion workflow checks the triggering run is a successful `main` push CI and still matches the current `main` head, verifies version metadata, and only then creates tag `1.6.1` on the verified commit. A mismatched pre-existing tag must abort, not be rewritten.
5. A tag push made with `GITHUB_TOKEN` does not start a second tag-push workflow. Promotion therefore dispatches `release.yml` with `tag=1.6.1`. The release workflow verifies tag ancestry in `main`, rebuilds, runs release checks and asset attestation, and creates the public GitHub Release with `main.js`, `manifest.json`, and `styles.css`.
6. Verify the tag SHA, release-workflow CI, public GitHub Release, all three download assets, and manifest 1.6.1; report these separately from Test Vault status. At preparation time, **do not create the tag or publish the release**, since `main` intentionally still points at the published 1.6.0 baseline.

## 1.6.0 publication sequence and exact-tag verification

The release candidate is based on `preview`. The user's explicit 1.6.0 approval authorizes a **non-squash history-preserving merge to `main`**. Verify the source head, review state and exact-head CI before merging; do not rewrite the published history or replace unrelated commits.

1. Merge the approved 1.6.0 release candidate into `main` **without squash**, preserving the distinct component and documentation commits.
2. Confirm the resulting `main` commit and wait for the **push-triggered CI on that exact commit**. Do not publish from a merely successful PR-head CI.
3. For 1.6.0 only, `.github/workflows/publish-1.6.0.yml` runs after a successful `main` push CI. It checks that the verified CI commit is still the current `main` head and that all four version metadata files agree; it then creates the exact lightweight `1.6.0` tag on that commit. The promotion is idempotent and refuses a conflicting existing tag.
4. A tag pushed by GitHub Actions' built-in `GITHUB_TOKEN` does **not** trigger another `push.tags` workflow. Accordingly, the promotion explicitly dispatches the existing `release.yml` through its new `workflow_dispatch` entry point with `tag=1.6.0`. Direct human tag pushes continue to use the original `push.tags` trigger.
5. The release workflow **checks out the exact tag**, validates it is on the published `main` history and matches `package.json`, runs npm checks/build/`release:check`, attests the assets and publishes `manifest.json`, `main.js`, and `styles.css`.
6. Verify the `1.6.0` Git ref points to the released commit, the GitHub Release is public, the assets contain version `1.6.0`, and both `main` CI and the dispatched release run succeeded. Synchronize `preview` with released `main` by fast-forward, preserving history.

The one-off promoter does **not** publish any other version. Never create a tag against a feature/review branch, use a mismatched `v` prefix, or claim that tag creation alone proves assets were published.


## Test Vault

After automated checks pass, run:

```bash
npm run test-vault
```

This installs only `main.js`, `manifest.json`, and `styles.css` into the disposable vault, prepares the controlled fixtures, and opens the manual checklist. The production Test Vault is the final place to verify real Obsidian lifecycle, Markdown rendering, note-media behavior, release tracking, Settings, and desktop/mobile layout.

The automated checks do not replace interactive Test Vault verification. A release candidate should not be merged or published until the manual checklist relevant to the changed features is explicitly approved.

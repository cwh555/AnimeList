# Community Plugins submission checklist

Always compare this checklist with the latest official Obsidian developer documentation before submitting or updating a public release.

## Repository preparation

1. Keep the GitHub repository public.
2. Keep the final public author name in `manifest.json`.
3. Keep the plugin ID as `animelist` after the first public release.
4. Keep `manifest.json`, `versions.json`, and `README.md` in the repository root.
5. Run `npm ci`, `npm run check`, and `npm run release:check` from the exact release candidate.
6. Complete `docs/MANUAL_TEST_CHECKLIST.md` on desktop and mobile for the changed features.

## Release preparation

1. Make sure `package.json`, `manifest.json`, `versions.json`, and the runtime plugin version contain the same final release information.
2. Create a tag that exactly matches the manifest version, without a `v` prefix.
3. Confirm that the GitHub release contains these assets:

   ```text
   manifest.json
   main.js
   styles.css
   ```

4. Download the assets from GitHub and perform one clean manual installation.
5. Confirm the release stylesheet passes the repository Community preflight without suppressing compatibility warnings.

## Developer Dashboard / Community review

1. Sign in to the Obsidian Community site with an Obsidian account.
2. Open the Developer Dashboard and connect the GitHub account that owns the repository.
3. Choose the public `AnimeList` repository.
4. Complete or update project metadata and capability disclosures.
5. Run a preview scan against the release tag or commit.
6. Resolve all blocking findings and browser-compatibility warnings before submission.
7. Submit the project or update when required by the Community workflow.

Use these project values:

```json
{
  "id": "animelist",
  "name": "AnimeList",
  "author": "YOUR_PUBLIC_AUTHOR_NAME",
  "description": "A local-first anime, manga, and novel library backed by Markdown, with metadata search, covers, ratings, templates, filters, and a completion timeline.",
  "repo": "YOUR_GITHUB_USERNAME/AnimeList"
}
```

## Network and privacy disclosure

AnimeList uses network access only for user-requested or explicitly enabled media functionality:

- metadata/search: Bangumi, AniList, and Open Library;
- cover discovery or fallback where configured, including Google Books for serial-cover fallback;
- opt-in manga release tracking: MangaDex plus supported official public chapter pages discovered from the exact preserved AniList work identity;
- opt-in novel release tracking: public NDL/JPRO catalog data;
- user-supplied image URLs when the user explicitly imports an image into an Image Section or Moment.

Review notes should make clear that:

- media records remain ordinary Markdown/YAML in the user's vault;
- ratings, reading/watch progress, dates, reusable tags, Moment text, general note-body content, and local images are not uploaded as telemetry;
- release tracking does not rewrite personal reading progress;
- there is no private remote AnimeList database and no telemetry service;
- network requests use Obsidian-supported request APIs rather than browser-only `fetch` where required by the plugin runtime.

## Review preparation

- Explain why each network source is needed and whether the feature is opt-in.
- Confirm that personal note content is not uploaded for metadata or release tracking.
- Confirm that all media records remain ordinary Markdown.
- Confirm that commands do not have default hotkeys.
- Confirm that source code and release artifacts match.
- Confirm that the generated `styles.css` is reproducible from tracked feature stylesheets.
- Confirm that the Community preview scan reports no unresolved compatibility warnings for the declared minimum Obsidian version.

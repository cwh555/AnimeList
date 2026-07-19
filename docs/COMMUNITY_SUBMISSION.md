# Community Plugins submission checklist

Always compare this checklist with the latest official Obsidian developer documentation before submitting.

## Repository preparation

1. Make the GitHub repository public.
2. Set the final public author name in `manifest.json`.
3. Keep the plugin ID as `animelist` after the first public release.
4. Keep `manifest.json`, `versions.json`, and `README.md` in the repository root.
5. Run `npm ci` and `npm run check` from a clean checkout.
6. Complete `docs/MANUAL_TEST_CHECKLIST.md` on desktop and mobile.

## Initial release

1. Make sure `package.json`, `manifest.json`, and `versions.json` contain the same release information.
2. Create a tag that exactly matches the manifest version, without a `v` prefix.
3. Confirm that the GitHub release contains these assets:

   ```text
   manifest.json
   main.js
   styles.css
   ```

4. Download the assets from GitHub and perform one clean manual installation.

## Developer Dashboard submission

1. Sign in to the Obsidian Community site with an Obsidian account.
2. Open the Developer Dashboard and connect the GitHub account that owns the repository.
3. Choose the public `AnimeList` repository.
4. Complete the project metadata and capability disclosures.
5. Run a preview scan against the release tag or commit.
6. Resolve all blocking findings before submission.
7. Submit the project. Automated review results are normally available within minutes.

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

The dashboard should disclose network access for metadata and cover search. The plugin does not upload personal note content or telemetry.

## Review preparation

- Explain why network access is needed: metadata and cover search from enabled providers.
- Confirm that personal note content is never uploaded.
- Confirm that all media records remain ordinary Markdown.
- Confirm that the plugin uses Obsidian `requestUrl` rather than browser `fetch`.
- Confirm that commands do not have default hotkeys.
- Confirm that source code and release artifacts match.

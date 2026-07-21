# AnimeList 1.1.0 preview verification

This version must be tested through the Obsidian Developer Dashboard **Preview** flow before a `1.1.0` tag or GitHub release is created.

## Automated gate

Run with the Node version from `.nvmrc`:

```bash
nvm use
rm -rf node_modules
npm ci
npm run check
node --check main.js
GITHUB_REF_TYPE=tag GITHUB_REF_NAME=1.1.0 npm run release:check
git diff --check
```

Expected results:

- TypeScript: no errors.
- ESLint / `eslint-plugin-obsidianmd`: zero warnings and zero errors.
- Node tests: all tests pass.
- Community review preflight: pass.
- Production build: creates `main.js`.
- Release preflight: reports `Release 1.1.0 is ready.`

The release preflight is only a local consistency check. Do not create or push a tag yet.

## Safe local installation

1. Make a copy of the test vault or commit it to Git before testing.
2. Disable AnimeList.
3. Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/animelist/`.
4. Reload Obsidian and enable AnimeList.
5. Confirm existing notes, covers, settings, and library counts are unchanged before editing anything.

## Required data tests

### Score requirement

- Create a planned or active anime, manga, and novel with the score empty. All three must save successfully and omit `score` from frontmatter.
- Change each record to completed. The UI must require both score and completion date.
- Change a completed record back to active, clear the score, and save. The `score` property must be removed.

### Existing records

- Open an existing 1.0.3 anime, manga, and novel.
- Confirm the library renders without rewriting their files.
- Toggle a favorite and confirm only the expected frontmatter field changes.
- Edit an old note and verify its body and unrelated YAML properties remain intact.

### Manga serial progress

- Create a releasing manga with current chapter `37`. It must show `已讀 37 話` without a percentage or latest chapter field.
- Mark reading status completed. Current progress must remain `37`; completion date must be required.
- Edit an old note containing `progress_total`; the field must be ignored in the UI and removed when the note is saved.

### Novel progress and volume history

- Create a novel with current `1.5` and no top-level dates. Confirm there is no latest/total volume field.
- Add volume labels `1`, `1.5`, and `EX`; verify their order.
- Verify `1.2`, blank labels, and duplicate normalized labels are rejected.
- Add volumes `1`, `1.5`, and `EX`; confirm each new row receives today as its completion date, then change one date manually.
- Save and inspect YAML: schema version 5, optional top-level dates, and a non-empty `completed_at` for every saved volume.
- Reopen the edit modal and confirm every value is unchanged.

### Volume editor navigation

- Add a volume to a novel that already has several volume rows. Confirm rows are ordered by normalized volume number rather than creation or date order, while the modal automatically scrolls the new row into view and focuses/selects its volume label.
- Change a row from volume `10` to `2.5`, leave the field, and confirm it immediately moves between `2` and `3`; `EX` remains after numbered volumes.
- Confirm each row contains only volume number, optional start date, completion date, and **移除**.
- Save and reopen the note. Each `volume_log` item must contain `label`, optional `started_at`, and `completed_at`.
- Confirm there is no per-volume cover field, cover search action, ISBN metadata, or extra cover-provider setting.

### Timeline

- Confirm every saved volume appears because completion dates default to today.
- Confirm each novel timeline card visibly shows the work title and `第 N 卷`, using the novel’s normal series cover.
- Create several events on the same and adjacent dates; confirm they use vertical lanes instead of overlapping at multiple zoom levels.
- Confirm selecting a volume timeline entry opens the series note.

## Developer Dashboard preview

After local tests pass:

```bash
git add CHANGELOG.md README.md docs manifest.json package.json package-lock.json versions.json scripts src styles.css tests
git diff --cached --check
git commit -m "Finalize AnimeList 1.1.0 serial tracking"
git push origin main
```

Then open the Obsidian Developer Dashboard:

1. Open **AnimeList → Preview**.
2. Select `main`.
3. Confirm the displayed commit matches `git rev-parse origin/main`.
4. Run Preview.
5. Open the result and verify every section completed without errors or warnings.

Do **not** create `1.1.0` or publish a GitHub release until this Preview and the manual checklist both pass.

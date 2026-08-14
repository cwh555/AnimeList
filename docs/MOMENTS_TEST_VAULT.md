# Moments Test Vault checklist

Use the seeded real episode-scene fixtures in the shared Test Vault to verify Moments before merging the feature branch.

## Layout

- Frieren `雖然只是很短的一段時間。`: the single landscape still is fully visible with no horizontal scrollbar.
- Frieren seven-image Moment: all images stay on one horizontal row and scroll horizontally; images never wrap or crop.
- Desktop keeps the editorial split card; narrow/mobile views stack quote/metadata above the same media row without page-level horizontal overflow.

## Optional metadata

Edit a Moment and exercise `source`, `position`, `speaker`, `tags`, and `note`.

- Populated fields appear in the left reading panel.
- Empty fields disappear from both reading view and serialized YAML.
- Legacy Moments containing only `id`, `text`, and `images` remain valid and do not render empty metadata placeholders.
- Kaguya's partial metadata fixture should show only the fields that are actually populated.

## Existing behavior

- Lightbox navigation stays scoped to the current Moment.
- Edit preserves the stable Moment ID.
- Copy text / Copy images continue to work.
- Deleting a Moment only trashes an AnimeList-managed image when no cover, Image Section, or other Moment still references it.
- Multiple `animelist-moments` blocks and unrelated Markdown remain untouched.

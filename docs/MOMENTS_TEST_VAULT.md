# Moments Test Vault checklist

Use the seeded real anime episode-scene fixtures in the shared Test Vault to verify Moments before merging the feature branch.

## Media-first card layout

- Each desktop Moment places media across the full card width first, then a lower content band.
- The lower content band uses a compact metadata column on the left (about one quarter of the width) and the quote/content column on the right. Empty metadata is not rendered; a Moment without metadata gives the quote the full content width.
- Metadata is visibly secondary: smaller type, compact rows/tags, and a subtle vertical divider separates it from the quote.
- Frieren `雖然只是很短的一段時間。`: the single 16:9 still is fully visible in the featured stage with no horizontal scrollbar. Letterboxing is acceptable; cropping is not.
- Two landscape screenshots should fit side by side across a typical 15-inch desktop viewport before scrolling. Larger groups remain one horizontal row and scroll horizontally; images never wrap or crop.
- Frieren seven-image Moment: all stills stay on one horizontal row and overflow horizontally.
- Frieren long-text regression Moment: the quote is clamped in the normal card, shows **展開**, and only grows after explicit expansion; **收合** restores the compact card.
- Narrow/mobile views keep media first, then quote, then metadata; no page-level horizontal overflow is allowed.

## Optional metadata

Edit a Moment and exercise `source`, `position`, `speaker`, `tags`, and `note`.

- Populated fields appear only in the metadata column.
- Empty fields disappear from both reading view and serialized YAML.
- Legacy Moments containing only `id`, `text`, and `images` remain valid and do not render empty metadata placeholders.
- Kaguya's partial metadata fixture should show only the fields that are actually populated.

## Real anime content fixtures

- The Frieren Image Section wall uses the ten official episode-1 STORY stills, not unrelated work covers.
- Kaguya-sama's two independent Image Sections use the three official season-1 episode-1 STORY stills.
- The same official scene pool is stored under `AnimeList/Images/test-vault/anime-scenes/` and reused by Moments and Image Sections; scene binaries are downloaded only while preparing Test Vault and are not committed to the repository.
- OVERLORD intentionally keeps an empty Image Section for manual file/paste/drag-drop/URL import verification.

## Existing behavior

- Lightbox navigation stays scoped to the current Moment.
- Edit preserves the stable Moment ID.
- Copy text / Copy images continue to work.
- Deleting a Moment only trashes an AnimeList-managed image when no cover, Image Section, or other Moment still references it.
- Multiple `animelist-moments` blocks, Image Sections, and unrelated Markdown remain untouched.

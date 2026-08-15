# Moments Test Vault checklist

Use the seeded real anime episode-scene fixtures in the shared Test Vault to verify Moments before merging the feature branch.

## Editorial card layout

- Each desktop Moment uses the approved three-part presentation: compact number rail, quote/metadata panel, and media panel.
- Metadata is visually secondary to the quote: smaller type, a divider above it, compact labels/tags, and it must never occupy more than half of the left panel. Empty metadata is not rendered.
- Frieren `雖然只是很短的一段時間。`: the single 16:9 landscape still is a featured media stage, fully visible at first glance with no horizontal scrollbar. Dark/gray letterboxing is acceptable for other aspect ratios; cropping is not.
- Frieren seven-image Moment: all stills stay on one horizontal row and scroll horizontally; images never wrap or crop. At the initial position, at least one complete landscape frame must fit inside the media viewport.
- Frieren long-text regression Moment: the quote is clamped in the normal card, shows **展開**, and only grows after the user explicitly expands it; **收合** restores the compact card.
- Desktop keeps quote/metadata on the left and media on the right. Narrow/mobile views stack quote/metadata above the same media area without page-level horizontal overflow.

## Optional metadata

Edit a Moment and exercise `source`, `position`, `speaker`, `tags`, and `note`.

- Populated fields appear beneath the quote divider.
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

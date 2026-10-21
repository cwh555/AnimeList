# Language and title data protocol

AnimeList separates **interface language**, **source identity**, and **stored user data**.

| Data | Interface-language switch | Persisted representation |
| --- | --- | --- |
| UI labels, notices and feature captions | Localized | i18n catalogs |
| Provider taxonomy tags with explicit API provenance | Localized in display only | Original API labels / compatible existing genres |
| Personal tags and user-defined names | Unchanged | Original input |
| Author, creator, studio, staff and publisher names | Unchanged | Provider values |
| Existing note titles | Unchanged | `title` in YAML frontmatter |
| Source-native work title | Unchanged | `title_original` |
| Searchable alternate titles | Unchanged | `title_aliases` |
| Known official title variants | Available for explicit selection | Optional `title_localizations` locale-to-title mapping |

## Choosing titles

A new API import chooses a title according to the current interface locale, using
the provider's explicitly identified variants. Missing variants fall back to the
existing provider/default title; **no missing translation is invented**. For Bangumi,
`name_cn` is treated as Simplified Chinese, while a Traditional Chinese infobox
entry may supply `zh-TW`. AniList English is explicitly identified; JP/KR native
titles are used as Japanese/Korean only with matching origin metadata.

The importer always retains source-native `title_original` and searchable
`title_aliases`. `title_localizations` keeps known, source-derived titles
separately so future migration need not guess the language from aliases.

## Existing notes / Updates & cleanup

Use *Update existing media titles* to choose a target language and review an exact
before → after list. No files are changed during preview. Only recognized source
IDs are queried; custom titles not provably related to provider titles are skipped.
Unknown language variants and failed provider lookups are not silently renamed.
The user may uncheck individual works before applying.

On confirmation, AnimeList rechecks the original title, source identifiers, and
file modification time. It writes **only** `title`, optional missing
`title_original`, merged `title_aliases`, and `title_localizations`,
via Obsidian FileManager.processFrontMatter. Existing unrelated YAML, note bodies,
media assets, paths, and user annotations are not rewritten. Individual errors are
reported; data errors are never treated as successful updates.

**Changing the UI language never runs this migration automatically.** This is
intentional: note names and custom titles are user-owned persistent data. Filename
and Markdown H1 headings are not updated by this title-only operation, preserving
existing Obsidian links and note content. The separate filename reconciliation
tool can be used later when desired.

## Limits

- This is **official-title selection**, not online machine translation.
- `zh-TW` does not automatically convert simplified characters to Taiwanese
  licensed titles. Not every provider exposes official translations.
- `title_localizations` is optional: older notes remain readable, and fields
  unknown to older versions are left as normal YAML.
- Future automatic display-name localization can use `title_localizations`,
  but must not mutate frontmatter on interface-language changes.

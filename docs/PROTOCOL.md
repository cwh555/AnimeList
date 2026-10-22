# AnimeList Protocol

This is the authoritative agreement for language boundaries and compatibility. Markdown and YAML frontmatter remain the source of truth.

## Language boundaries

AnimeList interface locales: zh-TW, zh-CN, en, ja, ko.

| Surface | Language behavior | Storage |
| --- | --- | --- |
| Workspace UI, buttons, notices, forms | Localize through i18n catalogs | No data rewrites |
| **Obsidian Settings and Settings-launched dialogs** | **Always English, including progress and errors** | No localization of Settings prose |
| Provider-category tags in the known dictionary | Translate labels for display | Keep original canonical values |
| User tags and custom text | No automatic translation | Preserve input |
| Author/studio/creator names | No automatic translation | Preserve source/user text |
| Newly imported work titles | Select known provider-labeled title for interface locale | Persist chosen title and provenance |
| Existing note titles | **Never change on interface locale switching** | Persist until user explicitly edits or migrates |

Legacy tag limitation: historical genres mixes provider terms and manually entered tags. A user tag that equals a recognized provider dictionary key may display a localized label even though the stored value is unchanged. Resolving such ambiguity requires a separate source-provenance migration.

## Title provenance

- title: current stored/user-controlled title.
- title_original: source-original title.
- title_romaji: romanized spelling when available.
- title_aliases: historical names and search aliases.
- title_localizations: optional locale-to-verified-title dictionary from the provider.
- title_script_conversions: optional locale-to-OpenCC-converted-name dictionary, written **only after the user explicitly accepts a suggestion**. It never claims the conversion is official, and allows round-trip selection without mistaking the previously accepted result for an unknown custom title.

Bangumi name_cn is Simplified Chinese, not necessarily an official Taiwanese Traditional title. A verified Traditional title must have explicit provenance from Bangumi infobox. AniList provides English/native/romaji, with JP/KR native attribution only if origin information supports it. Never invent an official translation from unlabelled synonyms. OpenCC (opencc-js 1.4.2) is available **only** as an offline Chinese-script-conversion fallback. It is **not** a provider-verified localized title or general machine translation.

## Existing-title update workflow

Settings → Updates & cleanup → Existing media titles → Preview title updates.

1. User selects target language; *all* Settings dialogs, button labels, status messages and errors remain English.
2. The scanner shows each work's name, path and result as it completes. All scanned work results remain visible in the review list, not just proposals.
3. Title candidates come from previously verified stored localizations, exact provider IDs, or exact provider IDs preserved in source URLs. Bangumi title-only requests omit the separate person/studio endpoint.
4. For an AniList-only work needing a Chinese name, a unique original-title matching Bangumi search result can be proposed **for explicit review only**. Ambiguous or mismatched-year results are rejected; such proposals are unchecked by default.
5. Every work shows its status: ready, review, unchanged, no-source, no-translation, custom-title, ambiguous, or lookup-failed. A Bangumi result with Simplified Chinese but no verified Traditional Chinese title may provide an OpenCC conversion as an **unchecked review-only proposal**; the UI must never mislabel it as an official translation. No Chinese source means a visible missing-translation status.
6. The user reviews old → proposed name and selects works. Preview never writes.
7. On apply, recheck source identity, original title and file modification time. Write only title, optional missing title_original, title_aliases, title_localizations and accepted title_script_conversions, through Obsidian processFrontMatter.
8. Do not alter filenames, Markdown bodies, headings, personal scores, progress, authors, tags, covers, rankings, or unrelated YAML. This protects Obsidian links and note ownership.
9. Each write outcome is reported. Closing the modal after confirmation does not cancel already-running writes, and a final notification still appears.

Requests are paced with shared minimum spacing (350ms by default) and bounded concurrency (three workers by default, maximum four); duplicate provider IDs are fetched once per scan. API failures are shown with their work and reason, never silently swallowed.

## Compatibility

Older notes without title_localizations remain usable and are not automatically modified. Changing the interface language must never trigger a data migration. Filename reconciliation is an entirely separate, manually previewed compatibility tool.

## Verification

Behavior tests must cover source-URL IDs, stored variants, AniList-only records, cross-provider ambiguity, custom titles, missing translations, 429 errors, cancellation, stale preview protection, bounded concurrency, and unrelated frontmatter preservation. Human Test Vault validation must additionally check Settings English, large-library scanning responsiveness, and exact update previews.

See ARCHITECTURE.md and VERIFICATION.md for module and release contracts, plus MANUAL_TEST_CHECKLIST.md for manual sign-off.

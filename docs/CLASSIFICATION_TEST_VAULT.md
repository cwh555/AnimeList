# Media Classification Test Vault Checklist

Use this checklist after pulling `feature/media-classification-v2` and running:

```bash
npm ci
npm run test-vault
```

The automated checks validate mapping, persistence, migration compatibility, AniList throttling, and four representative classification combinations. This checklist covers the remaining live-provider and Obsidian UI behavior.

## 1. Canonical classification on creation

Search for each work, prefer the localized Chinese result when available, create the note, and inspect its frontmatter.

| Work | Expected broad `genres` | Expected `year` | Expected `season` |
| --- | --- | ---: | ---: |
| 擅長捉弄人的高木同學 | 喜劇、戀愛、日常、校園 | 2018 | 1 |
| 葬送的芙莉蓮 | 冒險、劇情、奇幻、魔法 | 2023 | 7 |
| 輝夜姬想讓人告白 | 喜劇、心理、戀愛、校園 | 2019 | 1 |
| 藥師少女的獨語 | 劇情、懸疑、歷史 | 2023 | 10 |

Confirm for every created note:

- The displayed title may remain localized through Bangumi, but `source_provider` and canonical classification metadata resolve to AniList.
- `genres` contains only maintained broad categories.
- Provider detail tags such as character traits, occupations, setting details, demographics, or plot events are not imported.
- `year`, `season`, and studio/creator metadata are shown separately from classifications.
- `season` uses `1`, `4`, `7`, or `10` for winter, spring, summer, or autumn.

## 2. User-edited classification persistence

Before creating one of the works above:

1. Remove one automatic genre.
2. Add a custom genre such as `自訂分類`.
3. Add two custom work tags such as `待重看` and `年度推薦`.
4. Create the note and reopen it.

Expected result:

- The edited genre list is preserved instead of reverting to the automatic AniList list.
- `media_tags` contains both custom tags.
- The legacy `tags` field is absent.
- Reopening and saving an unrelated field does not remove the custom classification or tags.

## 3. AniList request throttling

Search several works consecutively, including Chinese and original-language queries.

Expected result:

- AniList is queried only once per multilingual search operation.
- Repeated equivalent requests reuse in-flight work or cache.
- Normal consecutive searches do not immediately produce HTTP 429 errors.
- If AniList rate-limits a request, the plugin respects the server retry interval and retries at most once.

## 4. Legacy cleanup and compatibility

Create or copy a legacy note containing polluted classification data, for example:

```yaml
genres:
  - Comedy
  - 2018
  - TV
  - 錯誤資料
media_tags:
  - 我的標籤
tags:
  - legacy-value
custom_field: preserve-me
```

Run **Clean up legacy classification data** in AnimeList settings.

Expected result:

- The work is resolved through canonical AniList metadata.
- `genres` is rebuilt from maintained broad categories.
- Custom `media_tags` is preserved.
- Legacy values are backed up under classification legacy fields.
- `tags` is removed.
- Unrelated frontmatter and the Markdown body are unchanged.
- Unresolved notes are reported and left without guessed canonical categories.

## 5. Regression checks

- Favorite/Masterpiece behavior from the generated `_AnimeList Test Checklist.md` remains unchanged.
- Manga and novel progress units remain unchanged.
- Rating half-point behavior remains unchanged.
- Library genre filtering uses the persisted canonical/custom genres.
- The branch remains a Draft PR and must not be merged until this checklist passes.

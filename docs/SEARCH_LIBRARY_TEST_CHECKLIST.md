# Search and Library Manual Verification

Use a clean Obsidian test vault with the plugin built from `feature/search-quality-duplicate-warning`.

## Open library

- Click the AnimeList ribbon icon once. The library view must open.
- Run **AnimeList: Open AnimeList** from the command palette. The existing library tab must be reused instead of opening duplicate tabs.
- Click the ribbon icon several times quickly. The library must open once and remain responsive.
- Temporarily configure a library path that cannot be created, then open the library. The library view must still open and an error notice must explain that folder setup failed.

## Search languages settings

- Open AnimeList settings and find one **Search languages** section.
- Confirm the three adjacent options are **Chinese titles**, **English titles**, and **Original-language titles**.
- Confirm every label and description on the settings page is English.
- Toggle each search-language option, close settings, reopen it, and confirm the values persist.

## Multilingual manga search

- Enable Bangumi and AniList.
- Enable all three search-language options.
- Add a manga and search for `漫畫裡的羅康林`.
- Confirm the results include the work whose native title is `수요웹툰의 나강림` and whose English alias is `Webtoon Character Na Kang-Lim`.
- Confirm the result is relevant to the entered title; unrelated results must not be promoted above it.
- Disable **Chinese titles** and repeat the same Traditional Chinese query. Chinese discovery must no longer run.
- Search directly with `Webtoon Character Na Kang-Lim` and `수요웹툰의 나강림`; both must still find the same work when their corresponding language options are enabled.

## Duplicate warning

- Add one anime from a provider, then select the confirmed same anime from another provider. A duplicate warning must appear and the existing note must be openable.
- Select another season, movie, OVA/ONA, special, recap, or side story from the same franchise. No duplicate warning should appear.
- Confirm adding a non-duplicate work still creates a note and preserves unrelated frontmatter and note content.

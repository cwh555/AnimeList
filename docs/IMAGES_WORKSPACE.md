# AnimeList workspace and Images page

This document fixes the navigation and Images-page information architecture so later UI work does not collapse page navigation and local filters into the same control hierarchy.

## Top-level workspace

The AnimeList ItemView has four peer pages, in this order:

1. **Library**
2. **Timeline**
3. **Score Dashboard**
4. **Images**

These are primary destinations, not toolbar actions. Switching them reuses the same AnimeList ItemView and does not open a modal or another Obsidian tab.

The primary navigation must remain visually distinct from page-local filters: icon + label, flat/underlined active treatment, and a persistent horizontal navigation row. On narrow/mobile layouts it may scroll horizontally but must not be hidden behind a hamburger menu.

The shared workspace header shows the **AnimeList** product name only; do not restore the old Markdown-description subtitle. The primary navigation row contains page navigation plus optional low-frequency **More** actions only. It must never produce vertical overflow or a vertical scrollbar.

- **Collect** belongs to the Library page, on the same row as `All / Anime / Manga / Novel`, aligned at that row's far right. It is not a global workspace action. Opening Collect uses the currently selected media type; `All` falls back to Anime.
- **More** contains enabled low-frequency tools such as Release Updates and may remain at the far right of the primary navigation row.
- Images, Timeline, and Score Dashboard must not be reintroduced as header action buttons.

Workspace pages must also own a definite content height. Timeline in particular renders its existing flex viewport inside the shared page; the page must not collapse that viewport to zero height. Image-gallery buttons must explicitly preserve intrinsic image/card height so Obsidian's normal button sizing cannot crop gallery content into thin strips.

## Page-local navigation

Primary workspace navigation and local filters must never use the same visual treatment.

- Library owns `All / Anime / Manga / Novel` and its status/filter/view controls.
- Images owns `All images / By work`, then `All / Anime / Manga / Novel` as content filters.
- A selected work in Images owns `All sessions / Session N`.
- Timeline and Score Dashboard keep their own existing controls only when those controls are meaningful to that page.

## Images data model

Images is a derived view over existing media-note Markdown. It does not copy, move, or create image files.

`animelist-images` fenced blocks remain the source of truth. The gallery index stores references consisting of the source media note, image path, media identity, session index, and source position. Parsing must reuse the existing Image Section domain parser rather than introducing another Markdown parser.

The gallery reads only known AnimeList media notes and caches per-note aggregation. It must not scan every Markdown file in the Vault on each render and must not perform an eager gallery scan during plugin startup.

Within one work, the same image path referenced by multiple Image Sections appears once in the work-level/all-images collection while retaining all session references. Session views still reflect the source sections.

## Images views

### All images

- One natural-height masonry gallery across matching works.
- Exact user-selected 1–6 column count; no hidden responsive column cap.
- Media-type filter and search operate before lightbox ordering.
- Lightbox previous/next follows the current filtered gallery.
- Every image keeps its own source-note context so resolution works across different media notes.

### By work

- Shows one board card per matching work.
- A board preview uses up to four existing images and displays unique-image/session counts.
- Opening a board shows the work gallery with `All sessions / Session N` filters and an **Open source work** action.

## Non-goals for this version

- No copied gallery files.
- No custom-board schema.
- No global drag ordering: a mixed-work gallery has no unambiguous Markdown order to write back.
- No cross-note image mutation from the Images page.
- No duplicate Timeline/Score/Images entry buttons in the Library header.

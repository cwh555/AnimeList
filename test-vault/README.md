# AnimeList test vault

This vault contains example anime, manga, and novel entries plus local cover images. It is intended only for plugin development and is not included in normal plugin installation.

Run the following commands from the repository root:

```bash
npm ci
npm run test-vault:link
npm run dev
```

Then open this `test-vault` folder in Obsidian, allow community plugins, and enable AnimeList.

## Novel-volume interaction test

Open the included novel record, select **新增一卷**, and verify that the row is ordered by normalized volume number, brought into view, and given today as its completion date. Change its label and confirm the row is repositioned after leaving the field. Each row should contain only the volume label, optional start date, completion date, and **移除**.

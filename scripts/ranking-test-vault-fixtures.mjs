import fs from "node:fs";
import path from "node:path";

/** Non-destructive manual comparison fixtures, independent of existing fixture migrations. */
export function prepareRankingTestFixtures(vaultRoot) {
  const folder = path.join(vaultRoot, "AnimeList", "Test Fixtures", "Ranking");
  const covers = path.join(vaultRoot, "AnimeList", "Covers", "ranking-fixtures");
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(covers, { recursive: true });
  let created = 0;
  for (const type of ["anime", "manga", "novel"]) {
    for (let index = 1; index <= 6; index++) {
      const key = type + "-" + index;
      const title = "Ranking fixture " + type.toUpperCase() + " " + index;
      const completed = index <= 5;
      const note = path.join(folder, key + ".md");
      const cover = path.join(covers, key + ".svg");
      const coverRelative = "AnimeList/Covers/ranking-fixtures/" + key + ".svg";
      const color = ["#455a84", "#8c555f", "#417f74", "#866f43", "#684a83", "#53646e"][index - 1];
      const image = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">'
        + '<rect width="300" height="450" fill="' + color + '"/>'
        + '<text x="150" y="200" fill="#fff" font-size="28" font-family="sans-serif" text-anchor="middle">'
        + type.toUpperCase() + '</text><text x="150" y="250" fill="#fff" font-size="72" font-family="sans-serif" text-anchor="middle">'
        + index + '</text></svg>';
      if (!fs.existsSync(cover)) fs.writeFileSync(cover, image + "\n");
      if (!fs.existsSync(note)) {
        const frontmatter = [
          "---",
          "schema_version: 6",
          "media_type: " + type,
          "title: " + JSON.stringify(title),
          "status: " + (completed ? "completed" : "ongoing"),
          "score: " + (index % 2 === 0 ? "7.0" : "8.0"),
          "cover: " + JSON.stringify(coverRelative),
          "source_provider: manual",
          "source_id: " + JSON.stringify("ranking-fixture-" + key),
          ...(completed ? ["completed_at: 2026-01-01"] : []),
          "---",
          "",
          "# " + title,
          "",
          "~~~animelist-detail",
          "~~~",
          "",
        ].join("\n");
        fs.writeFileSync(note, frontmatter);
        created += 1;
      }
    }
  }
  const checklist = path.join(vaultRoot, "_AnimeList Ranking Checklist.md");
  if (!fs.existsSync(checklist)) {
    fs.writeFileSync(checklist, [
      "# 排名功能 Test Vault 驗證",
      "",
      "- [ ] 開啟 AnimeList → 分數表 → 排名。確認三類各有 5 部已完成作品，未完成作品不參與排序。",
      "- [ ] 動畫點「開始排名」，點封面選擇，驗證排名 List 顯示封面與連續名次。",
      "- [ ] 比較時點「跳過」，讓至少一部作品進入「待定」且沒有假名次；再透過「處理待定」重試。",
      "- [ ] 用列表拖曳把手調換名次，或從更多選單「移至指定名次」。",
      "- [ ] 點「重新比較」單部作品；點「上一步」復原最近一次二選一。",
      "- [ ] 中途按「儲存並離開」，重新開啟或重新啟動 Obsidian 後繼續。",
      "- [ ] 新增一筆已完成作品，再按「排入新作品」；既有順序保持。",
      "- [ ] 動畫／漫畫／小說切換互不干擾；評分頁與 Markdown score 不變。",
      "- [ ] 重新命名某作品筆記，確認排名仍能找到該作品。",
      "- [ ] 把已排名作品改成「進行中」，應退出；改回「已完成」需重新排入。",
      "- [ ] 手機上垂直滑動 List 不誤拖；拖曳只能由把手開始，320px 寬不溢出。",
      "- [ ] 桌面上點封面、鍵盤上下鍵移位與滑鼠拖曳都可用。",
      "- [ ] 以四種語言各檢查模式切換、跳過、待定、警告、重新排名文字。",
      "- [ ] 重新執行 test vault 安裝後，排名資料不應消失。",
      "",
    ].join("\n"));
  }
  return { created, checklist };
}

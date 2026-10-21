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
      "- [ ] 動畫點「開始」，確認彈出比較視窗；點封面選擇，回到清單後可看到封面與連續名次。",
      "- [ ] 比較視窗內按「暫停」或 Esc 返回清單，再點「繼續」恢復相同進度。",
      "- [ ] 在 320px／390px 手機、桌面檢查長中日英文字標題最多兩行，封面與按鈕不得溢出 Modal。",
      "- [ ] 比較時點「跳過」，讓至少一部作品進入「待定」且沒有假名次；再透過「處理待定」重試。",
      "- [ ] 桌面／手機都確認一部作品一列；名次、封面、標題靠左、最右側拖曳把手，不再有大灰色內層按鈕。",
      "- [ ] 拖曳時列表列副本跟隨滑鼠／手指，原位佔位，放開後才變更名次。",
      "- [ ] 確認沒有「區間重排」及各作品的「移至名次」按鈕；比較視窗仍顯示輪次。",
      "- [ ] 點「上一步」復原比較；選「重排」需先顯示確認視窗。",
      "- [ ] 中途按「暫停」，重新開啟或重新啟動 Obsidian 後點「繼續」。",
      "- [ ] 新增一筆已完成作品，再按「新增作品」進行比較；既有順序保持。",
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
  // Keep the user's original checklist and marks intact on repeated test-vault builds.
  const updateMarker = "## 分輪排名／拖曳預覽驗證";
  const original = fs.readFileSync(checklist, "utf8");
  if (!original.includes(updateMarker)) {
    fs.appendFileSync(checklist, [
      "",
      updateMarker,
      "- [ ] 分輪比較顯示第 N 輪；同輪多組作品輪流出現，直到形成完整名次。",
      "- [ ] 跳過的作品仍進入待定，不會被當作平手或隨意插入排名。",
      "- [ ] 不顯示「區間重排」；列表每部作品一列，人工調整只透過拖曳把手／鍵盤方向鍵。",
      "- [ ] 拖曳預覽跟著滑鼠／觸控移動，顯示目標位置並於放開後正確排序。",
      "- [ ] 桌面與手機都是單欄、每部作品一列，內容與上方「評分／排名」切換列左右對齊。",
      "",
    ].join("\n"));
  }
  const latestMarker = "## 單列排名驗證（新版）";
  const current = fs.readFileSync(checklist, "utf8");
  if (!current.includes(latestMarker)) {
    fs.appendFileSync(checklist, [
      "",
      latestMarker,
      "- [ ] 桌面 1200px、平板 768px、手機 390px／320px 全部只顯示每部作品一列，名次、封面、標題由左至右排列。",
      "- [ ] 不出現寬大的灰色內層按鈕，排名列沒有「更多」、「移至名次」或「區間重排」。",
      "- [ ] 只透過拖曳把手移動已排名作品；觸控上下滑動作品標題不會啟動拖曳。",
      "- [ ] 拖曳預覽跟隨指標，放開後更新名次；長清單位置保留且未破壞評分模式。",
      "",
    ].join("\n"));
  }
  return { created, checklist };
}

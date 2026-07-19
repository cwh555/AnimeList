import type { MediaType, TemplateOption } from "./types";

export const BUILTIN_TEMPLATE_PREFIX = "builtin:";

const SHARED_HEADER = `# {{title}}\n\n> Added on {{date}} at {{time}}.\n`;

export const BUILTIN_TEMPLATES: Record<string, string> = {
  "builtin:anime-review": `${SHARED_HEADER}\n## 一句話記錄\n\n\n## 觀後心得\n\n\n## 喜歡的地方\n\n\n## 覺得可惜的地方\n\n\n## 角色與關係\n\n\n## 精選截圖\n\n> 將圖片拖入此處，並補上一句當時的感想。\n\n## 印象深刻的台詞\n\n\n## 製作與演出筆記\n\n`,
  "builtin:anime-episode-notes": `${SHARED_HEADER}\n## 逐集隨筆\n\n### 第 1 集\n\n\n## 精選截圖\n\n\n## 完結後補記\n\n`,
  "builtin:manga-reading-notes": `${SHARED_HEADER}\n## 閱讀心得\n\n\n## 喜歡的篇章\n\n\n## 精選插畫\n\n> 將喜歡的跨頁、分鏡或插畫放在這裡。\n\n## 印象深刻的台詞\n\n\n## 卷次紀錄\n\n`,
  "builtin:novel-reading-notes": `${SHARED_HEADER}\n## 閱讀心得\n\n\n## 主題與人物\n\n\n## 精選插畫\n\n\n## 喜歡的段落\n\n\n## 卷次紀錄\n\n`,
  "builtin:plain": `${SHARED_HEADER}\n## 筆記\n\n`,
};

export function getBuiltInTemplateOptions(mediaType: MediaType): TemplateOption[] {
  const common: TemplateOption[] = [{ path: "builtin:plain", name: "簡潔筆記（內建）" }];
  if (mediaType === "anime") {
    return [
      { path: "builtin:anime-review", name: "觀後札記（內建）" },
      { path: "builtin:anime-episode-notes", name: "逐集隨筆（內建）" },
      ...common,
    ];
  }
  if (mediaType === "manga") {
    return [{ path: "builtin:manga-reading-notes", name: "漫畫閱讀札記（內建）" }, ...common];
  }
  return [{ path: "builtin:novel-reading-notes", name: "小說閱讀札記（內建）" }, ...common];
}

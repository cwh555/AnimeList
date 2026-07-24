import type { SpecialLabelMode } from "./masterpiece-labels";

const TEXT = {
  "settings.heading": "Special label",
  "settings.mode.name": "Special label mode",
  "settings.mode.desc": "Choose whether the star marks a simple favorite or one or more reusable masterpiece categories.",
  "settings.mode.favorite": "Favorite",
  "settings.mode.masterpiece": "Masterpiece",
  "settings.labels.name": "Masterpiece categories",
  "settings.labels.desc": "Rename or delete reusable masterpiece categories. Deleting a category removes it from every media note.",
  "settings.labels.empty": "No masterpiece categories have been created yet.",
  "settings.labels.rename": "Rename",
  "settings.labels.delete": "Delete",
  "settings.labels.placeholder": "New category name",
  "library.favorite": "最愛",
  "library.masterpiece": "masterpiece",
  "library.addMasterpiece": "加入 masterpiece",
  "library.editMasterpiece": "編輯 masterpiece",
  "modal.title": "選擇 masterpiece 類別",
  "modal.description": "可同時選擇多個既有類別，或建立新的類別。",
  "modal.newLabel": "新增類別",
  "modal.newLabelPlaceholder": "例如：戀愛番 masterpiece",
  "modal.save": "儲存",
  "modal.remove": "移除 masterpiece",
  "notice.saved": "已更新 masterpiece 類別。",
  "notice.removed": "已移除 masterpiece。",
  "notice.renamed": "Masterpiece category renamed.",
  "notice.deleted": "Masterpiece category deleted.",
} as const;

export type MasterpieceFeatureTextKey = keyof typeof TEXT;

export function masterpieceFeatureText(key: MasterpieceFeatureTextKey): string {
  return TEXT[key];
}

export function specialLabelName(mode: SpecialLabelMode): string {
  return masterpieceFeatureText(mode === "masterpiece" ? "library.masterpiece" : "library.favorite");
}

import { defineTextCatalog } from "../../i18n/catalog";
import { MASTERPIECE_MESSAGES } from "../../i18n/locales/zh-TW/masterpiece";
import type { SpecialLabelMode } from "../../domain/masterpiece-labels";

const TEXT = MASTERPIECE_MESSAGES;

const CATALOG = defineTextCatalog("masterpiece", TEXT);
export type MasterpieceFeatureTextKey = keyof typeof TEXT;

export function masterpieceFeatureText(key: MasterpieceFeatureTextKey): string {
  return CATALOG.text(key);
}

export function masterpieceActionText(favorite: boolean): string {
  return masterpieceFeatureText(favorite ? "library.editMasterpiece" : "library.addMasterpiece");
}

export function specialLabelName(mode: SpecialLabelMode): string {
  return masterpieceFeatureText(mode === "masterpiece" ? "library.masterpiece" : "library.favorite");
}

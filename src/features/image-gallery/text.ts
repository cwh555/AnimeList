import { defineTextCatalog } from "../../i18n/catalog";
import { IMAGE_GALLERY_MESSAGES } from "../../i18n/locales/zh-TW/image-gallery";

export const IMAGE_GALLERY_TEXT = IMAGE_GALLERY_MESSAGES;
const CATALOG = defineTextCatalog("image-gallery", IMAGE_GALLERY_TEXT);

export function imageGalleryText(
  key: keyof typeof IMAGE_GALLERY_TEXT,
  variables: Record<string, string | number> = {},
): string {
  return CATALOG.text(key, variables);
}

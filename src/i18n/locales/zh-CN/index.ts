import { ZH_TW_CATALOGS, type LocaleCatalogs } from "../zh-TW";
import { RANKING_MESSAGES } from "./ranking";
import { CORE_MESSAGES } from "./core";
import { LEGACY_METADATA_MESSAGES } from "./legacy-metadata";
import { MASTERPIECE_MESSAGES } from "./masterpiece";
import { PROGRESS_UNIT_MESSAGES } from "./progress-unit";
import { RATING_MESSAGES } from "./rating";
import { RELEASE_TRACKING_MESSAGES } from "./release-tracking";
import { SCORE_DASHBOARD_MESSAGES } from "./score-dashboard";
import { SEARCH_MESSAGES } from "./search";
import { SERIAL_COVER_MESSAGES } from "./serial-cover";
import { USER_TAG_MESSAGES } from "./user-tag";
import { IMAGE_SECTION_MESSAGES } from "./image-section";
import { MOMENTS_MESSAGES } from "./moments";
import { IMAGE_GALLERY_MESSAGES } from "./image-gallery";
import { LIBRARY_EXPORT_MESSAGES } from "./library-export";
import { TIMELINE_WORKSPACE_MESSAGES } from "./timeline-workspace";
import { MANUAL_MEDIA_MESSAGES } from "./manual-media";
import { LIBRARY_LAYOUT_MESSAGES } from "./library-layout";

function completeCatalog<T extends Record<string, string>>(reference: T, translated: Record<string, string>): T {
  return Object.fromEntries(Object.entries(reference).map(([key, value]) => [key, translated[key] ?? value])) as T;
}

/** Keep source locale keys authoritative as new features are added. */
export const ZH_CN_CATALOGS: LocaleCatalogs = {
  core: completeCatalog(ZH_TW_CATALOGS["core"], { ...CORE_MESSAGES,
    "settings.language.zhCN": "简体中文",
    "edit.coverHeading": "更换封面",
    "edit.coverHint": "选择新的本地图片。保存前不会修改原有封面。",
    "edit.coverCurrent": "当前封面",
    "edit.coverNew": "新封面",
    "edit.coverChoose": "选择图片",
    "edit.coverClear": "清除选择",
    "edit.coverUnchanged": "保持原封面",
    "edit.coverMissing": "无法显示封面",
  }),
  search: completeCatalog(ZH_TW_CATALOGS["search"], SEARCH_MESSAGES),
  rating: completeCatalog(ZH_TW_CATALOGS["rating"], RATING_MESSAGES),
  "release-tracking": completeCatalog(ZH_TW_CATALOGS["release-tracking"], RELEASE_TRACKING_MESSAGES),
  "serial-cover": completeCatalog(ZH_TW_CATALOGS["serial-cover"], SERIAL_COVER_MESSAGES),
  "progress-unit": completeCatalog(ZH_TW_CATALOGS["progress-unit"], PROGRESS_UNIT_MESSAGES),
  masterpiece: completeCatalog(ZH_TW_CATALOGS["masterpiece"], MASTERPIECE_MESSAGES),
  "score-dashboard": completeCatalog(ZH_TW_CATALOGS["score-dashboard"], { ...SCORE_DASHBOARD_MESSAGES, mobileHint: "长按选择并移动作品，避免滑动时误改评分。" }),
  ranking: completeCatalog(ZH_TW_CATALOGS["ranking"], RANKING_MESSAGES),
  "legacy-metadata": completeCatalog(ZH_TW_CATALOGS["legacy-metadata"], LEGACY_METADATA_MESSAGES),
  "user-tag": completeCatalog(ZH_TW_CATALOGS["user-tag"], USER_TAG_MESSAGES),
  "image-section": completeCatalog(ZH_TW_CATALOGS["image-section"], IMAGE_SECTION_MESSAGES),
  moments: completeCatalog(ZH_TW_CATALOGS["moments"], MOMENTS_MESSAGES),
  "image-gallery": completeCatalog(ZH_TW_CATALOGS["image-gallery"], IMAGE_GALLERY_MESSAGES),
  "library-layout": completeCatalog(ZH_TW_CATALOGS["library-layout"], LIBRARY_LAYOUT_MESSAGES),
  "library-export": completeCatalog(ZH_TW_CATALOGS["library-export"], LIBRARY_EXPORT_MESSAGES),
  "timeline-workspace": completeCatalog(ZH_TW_CATALOGS["timeline-workspace"], TIMELINE_WORKSPACE_MESSAGES),
  "manual-media": completeCatalog(ZH_TW_CATALOGS["manual-media"], MANUAL_MEDIA_MESSAGES),
};

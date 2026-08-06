const USER_TAG_TEXT = {
  "settings.heading": "標籤管理",
  "settings.description": "管理可重複使用的作品標籤。從單一作品移除標籤，不會刪除這裡的標籤。",
  "settings.name": "標籤",
  "settings.desc": "新增標籤，或點擊既有標籤進行重新命名與全域刪除。重新命名與刪除會同步更新 Library 中使用該標籤的作品。",
  "settings.addPlaceholder": "新增標籤",
  "settings.add": "新增",
  "settings.rename": "重新命名",
  "settings.delete": "從所有作品刪除",
  "settings.cancel": "取消",
  "settings.empty": "目前沒有標籤。",
  "notice.renamed": "已重新命名標籤；更新 {count} 個作品。",
  "notice.deleted": "已刪除標籤；更新 {count} 個作品。",
} as const;

export type UserTagTextKey = keyof typeof USER_TAG_TEXT;

export function userTagText(key: UserTagTextKey, variables: Record<string, string | number> = {}): string {
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    USER_TAG_TEXT[key],
  );
}

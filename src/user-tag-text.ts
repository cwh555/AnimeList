const USER_TAG_TEXT = {
  "settings.heading": "Tags",
  "settings.description": "Manage reusable work tags without crowding the settings page.",
  "settings.name": "Tag manager",
  "settings.desc": "Add, rename, delete, and review tag usage across your AnimeList library.",
  "settings.manage": "Manage tags…",

  "manager.title": "Manage tags",
  "manager.description": "Search reusable tags, add new ones, or open a tag to manage where it is used.",
  "manager.searchPlaceholder": "Search tags…",
  "manager.addPlaceholder": "New tag",
  "manager.add": "Add tag",
  "manager.empty": "No tags yet.",
  "manager.noMatches": "No matching tags.",
  "manager.usageCount": "{count} works",
  "manager.detailDescription": "Rename or delete this tag, or remove it from individual works below.",
  "manager.rename": "Rename",
  "manager.delete": "Delete tag",
  "manager.cancel": "Cancel",
  "manager.back": "← All tags",
  "manager.close": "Close",
  "manager.usedBy": "Used by {count} works",
  "manager.unused": "This tag is not used by any work.",
  "manager.removeFromWork": "Remove {tag} from {title}",

  "notice.renamed": "Tag renamed; updated {count} works.",
  "notice.deleted": "Tag deleted; updated {count} works.",
  "notice.removedFromWork": "Tag removed from {title}.",
} as const;

export type UserTagTextKey = keyof typeof USER_TAG_TEXT;

export function userTagText(key: UserTagTextKey, variables: Record<string, string | number> = {}): string {
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    USER_TAG_TEXT[key],
  );
}

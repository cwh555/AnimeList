/** Accept only provider-verified IDs or a Bangumi URL stored with the work. */
export function bangumiSubjectId(frontmatter: Record<string, unknown>): string {
  const raw = frontmatter.source_provider === "bangumi" ? frontmatter.source_id : undefined;
  const id = typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw)
    : typeof raw === "string" ? raw : "";
  if (/^[1-9]\d*$/.test(id)) return id;
  const urls = Array.isArray(frontmatter.source_urls) ? frontmatter.source_urls : [];
  for (const entry of urls) {
    if (typeof entry !== "string") continue;
    try {
      const url = new URL(entry);
      if (!["bangumi.tv", "bgm.tv", "chii.in"].includes(url.hostname.toLowerCase())) continue;
      const match = /^\/subject\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (match) return match[1];
    } catch { /* malformed provenance is not a verified ID */ }
  }
  return "";
}

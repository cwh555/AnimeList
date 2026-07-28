export function parseAnimeListBlockConfig(source: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return config;
}

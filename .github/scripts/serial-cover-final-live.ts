import { writeFile } from "node:fs/promises";
import {
  clearSerialCoverProviderCache,
  configureSerialCoverProvider,
  configureSerialCoverProviderForTests,
  searchSerialCovers,
} from "../../src/serial-cover-provider";
import { confidentSerialCover } from "../../src/serial-entry-cover";

const works = new Map<string, string>([
  ["KonoSuba", "この素晴らしい世界に祝福を！"],
  ["Mushoku Tensei", "無職転生 ～異世界行ったら本気だす～"],
  ["Invaders of the Rokujouma", "六畳間の侵略者！？"],
  ["That Time I Got Reincarnated as a Slime", "転生したらスライムだった件"],
]);

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function hasExplicitVolume(title: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(title.normalize("NFKC"));
}

const report: Array<Record<string, unknown>> = [];
configureSerialCoverProvider({ apiKey: "" });
configureSerialCoverProviderForTests({
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: () => 0,
});
clearSerialCoverProviderCache();

try {
  for (const [work, originalTitle] of works) {
    for (let volume = 1; volume <= 10; volume += 1) {
      const label = String(volume);
      const query = `${originalTitle} ${label}`;
      const candidates = await searchSerialCovers(query, originalTitle, label, "novel");
      const selected = confidentSerialCover(candidates);
      if (!selected) {
        throw new Error(`${work} ${volume}: no confident result; top=${JSON.stringify(candidates.slice(0, 5))}`);
      }
      if (selected.provider !== "Bangumi") {
        throw new Error(`${work} ${volume}: unexpected provider ${selected.provider}`);
      }
      if (selected.mediaTypeHint !== "novel") {
        throw new Error(`${work} ${volume}: wrong media type ${selected.mediaTypeHint ?? "unknown"}`);
      }
      if (!normalize(selected.title).startsWith(normalize(originalTitle))) {
        throw new Error(`${work} ${volume}: wrong series ${selected.title}`);
      }
      const implicitFirst = label === "1" && normalize(selected.title) === normalize(originalTitle);
      if (!implicitFirst && !hasExplicitVolume(selected.title, label)) {
        throw new Error(`${work} ${volume}: wrong volume ${selected.title}`);
      }
      const image = await fetch(selected.coverUrl, {
        headers: {
          Range: "bytes=0-255",
          "User-Agent": "AnimeList/1.1.2 (https://github.com/cwh555/AnimeList)",
        },
      });
      const bytes = await image.arrayBuffer();
      if (!image.ok || bytes.byteLength === 0) {
        throw new Error(`${work} ${volume}: cover is not downloadable (${image.status})`);
      }
      const row = {
        work,
        volume,
        query,
        sourceId: selected.sourceId,
        title: selected.title,
        provider: selected.provider,
        score: selected.score,
        coverStatus: image.status,
        coverBytes: bytes.byteLength,
      };
      report.push(row);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await writeFile("serial-cover-live-report.json", JSON.stringify(report, null, 2));
}

if (report.length !== 40) {
  throw new Error(`Expected 40 successful results, received ${report.length}`);
}

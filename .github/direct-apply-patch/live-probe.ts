(globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;

const {
  clearSerialCoverProviderCache,
  configureSerialCoverProviderForTests,
  searchManualSerialCovers,
  searchSerialCovers,
} = await import("../../src/serial-cover-provider");
const {
  confidentSerialCover,
  manualSerialCoverQueries,
  serialCoverQuery,
} = await import("../../src/serial-entry-cover");

configureSerialCoverProviderForTests({
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: () => 0,
});

async function checkCover(url: string): Promise<{ status: number; bytes: number }> {
  const response = await fetch(url, { headers: { Range: "bytes=0-255" } });
  const bytes = (await response.arrayBuffer()).byteLength;
  if (!(response.ok || response.status === 206) || bytes < 1) {
    throw new Error(`Cover fetch failed: ${response.status} ${bytes} ${url}`);
  }
  return { status: response.status, bytes };
}

const report: { manual: unknown[]; automatic: unknown[] } = { manual: [], automatic: [] };
const manualWorks = [
  {
    title: "關於我被隔壁天使變成廢材這件事",
    referenceTitle: "お隣の天使様にいつの間にか駄目人間にされていた件",
    expectedId: "280977",
  },
  {
    title: "不時以俄語遮羞的艾利同學",
    referenceTitle: "時々ボソッとロシア語でデレる隣のアーリャさん",
    expectedId: "339092",
  },
  { title: "冰菓", referenceTitle: "氷菓", expectedId: "27902" },
];

for (const work of manualWorks) {
  clearSerialCoverProviderCache();
  const label = "1";
  const query = serialCoverQuery(work.title, label);
  if (!query) throw new Error(`Could not build manual query for ${work.title}`);
  const candidates = await searchManualSerialCovers(
    query,
    work.title,
    work.referenceTitle,
    label,
    "novel",
  );
  if (candidates.length < 1) throw new Error(`Manual search returned no candidates for ${work.title}`);
  if (candidates[0]?.sourceId !== work.expectedId) {
    throw new Error(
      `Manual search ranked the wrong first candidate for ${work.title}: expected ${work.expectedId}, got ${candidates[0]?.sourceId} ${candidates[0]?.title}`,
    );
  }
  const visible = candidates.slice(0, 8);
  if (visible.some((candidate) => !candidate.coverUrl)) {
    throw new Error(`Manual search returned a candidate without cover for ${work.title}`);
  }
  report.manual.push({
    ...work,
    inputQueries: manualSerialCoverQueries(work.title, label),
    referenceQueries: manualSerialCoverQueries(work.referenceTitle, label),
    candidateCount: candidates.length,
    topCandidates: visible.map((candidate) => ({
      sourceId: candidate.sourceId,
      title: candidate.title,
      mediaTypeHint: candidate.mediaTypeHint,
      score: candidate.score,
      coverUrl: candidate.coverUrl,
    })),
    topCoverCheck: await checkCover(visible[0].coverUrl),
  });
}

const expected = new Map<string, string>([
  ["14", "223981"], ["15", "223980"], ["16", "260752"], ["17", "260753"],
  ["18", "260754"], ["19", "260755"], ["20", "267778"], ["21", "277156"],
  ["22", "287149"], ["23", "305455"], ["24", "321201"], ["25", "348137"],
  ["26", "403823"],
]);
const originalTitle = "無職転生 ~異世界行ったら本気だす~";
for (const [label, expectedId] of expected) {
  clearSerialCoverProviderCache();
  const query = serialCoverQuery(originalTitle, label);
  if (!query) throw new Error(`Could not build automatic query for volume ${label}`);
  const candidates = await searchSerialCovers(query, originalTitle, label, "novel");
  const confident = confidentSerialCover(candidates);
  if (!confident) throw new Error(`No confident automatic candidate for Mushoku volume ${label}`);
  if (confident.sourceId !== expectedId) {
    throw new Error(`Wrong Mushoku volume ${label}: expected ${expectedId}, got ${confident.sourceId} ${confident.title}`);
  }
  report.automatic.push({
    label,
    expectedId,
    sourceId: confident.sourceId,
    title: confident.title,
    score: confident.score,
    coverCheck: await checkCover(confident.coverUrl),
  });
}

const { writeFile } = await import("node:fs/promises");
await writeFile("serial-cover-live-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

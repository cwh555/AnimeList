import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build, stop } from "esbuild";
import { runChromiumDatasetTest } from "./browser/chromium-page-runner.mjs";

const root = process.cwd();
const output = path.join(root, ".tmp", "image-section-order-session");
const profile = path.join(output, "chrome-profile");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      export { ImageSectionOrderSession } from "./src/ui/image-section-order-session";
      export { moveImageSectionAsset } from "./src/ui/image-section-move-coordinator";
    `,
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(output, "order-session.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AnimeListOrderSession",
  target: "es2022",
  logLevel: "warning",
  plugins: [{
    name: "obsidian-browser-stub",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      buildContext.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        loader: "js",
        contents: `export function normalizePath(value) { return String(value || ""); }`,
      }));
    },
  }],
});
const bundle = await readFile(path.join(output, "order-session.js"), "utf8");
const html = `<!doctype html><html><body data-result="pending"><script>${bundle}</script><script>
const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clone=(value)=>value?JSON.parse(JSON.stringify(value)):value;
const makeJournal=()=>{
 const records=new Map();
 const stats={writes:0,removes:0,fail:false,maxConcurrent:0,active:0};
 return {
  stats,
  async loadAll(){return [...records.values()].map(clone)},
  async write(record){
   stats.active+=1; stats.maxConcurrent=Math.max(stats.maxConcurrent,stats.active);
   try { await delay(5); if(stats.fail) throw new Error('journal-failure'); records.set(record.sourcePath,clone(record)); stats.writes+=1; }
   finally { stats.active-=1; }
  },
  async remove(sourcePath){records.delete(sourcePath);stats.removes+=1},
  snapshot(){return [...records.values()].map(clone)},
 };
};
const participant=(canonical,line=10,sourcePath='Demo.md')=>{
 let paths=[...canonical]; let owned=true;
 return {
  sourcePath,containerEl:document.body,
  canonicalPaths:()=>canonical,paths:()=>paths,locator:()=>({source:canonical.map((p)=>'- '+p).join('\\n'),lineStart:line}),
  ownsContainer:()=>owned,applyPaths:(next)=>{paths=[...next]},layoutMotion:()=>Promise.resolve(),
  current:()=>[...paths],setOwned:(value)=>{owned=value},
 };
};
(async()=>{
 const details={};
 const journal=makeJournal();
 let canonicalWrites=0; let committed=[];
 const committer={async commitPendingSectionOrders(_source,pending){canonicalWrites+=1;committed=clone(pending)}};
 const session=new AnimeListOrderSession.ImageSectionOrderSession(journal,committer);
 await session.initialize();
 const p=participant(['a.jpg','b.jpg','c.jpg']);
 const initial=session.register(p); p.applyPaths(initial);
 const operations=[];
 for(let i=0;i<100;i+=1){
  const current=p.current();
  const moving=current[0];
  const target=current[current.length-1];
  operations.push(AnimeListOrderSession.moveImageSectionAsset({orderSession:session,source:p,target:p,path:moving,targetPath:target,placement:'after'}));
 }
 await Promise.all(operations);
 details.hundredMovesStayInLiveRenderer=p.current().join(',')!=='a.jpg,b.jpg,c.jpg';
 details.visibleDragDoesNotRewriteMarkdown=canonicalWrites===0;
 details.durableJournalIsCoalesced=journal.stats.writes===1 && journal.stats.maxConcurrent===1 && journal.snapshot().length===1;
 const finalOrder=p.current().join(',');
 session.unregister(p);
 const replacement=participant(['a.jpg','b.jpg','c.jpg']);
 const adopted=session.register(replacement); replacement.applyPaths(adopted);
 details.replacementAdoptsPendingOrderBeforePaint=replacement.current().join(',')===finalOrder;
 session.unregister(replacement);
 await delay(720);
 details.hiddenSourceFlushesCanonicalOnce=canonicalWrites===1 && committed[0]?.paths.join(',')===finalOrder && journal.snapshot().length===0;
 session.dispose();

 const renameJournal=makeJournal();
 const renameCommits=[];
 const renameSession=new AnimeListOrderSession.ImageSectionOrderSession(renameJournal,{
  async commitPendingSectionOrders(sourcePath,pending){renameCommits.push({sourcePath,pending:clone(pending)})},
 });
 await renameSession.initialize();
 const renamedParticipant=participant(['a.jpg','b.jpg','c.jpg'],10,'AnimeList/Anime/Old.md');
 renamedParticipant.applyPaths(renameSession.register(renamedParticipant));
 await AnimeListOrderSession.moveImageSectionAsset({
  orderSession:renameSession,source:renamedParticipant,target:renamedParticipant,
  path:'c.jpg',targetPath:'a.jpg',placement:'before',
 });
 const renamedDesired=renamedParticipant.current().join(',');
 details.renameStartsWithOldJournal=renameJournal.snapshot().length===1 && renameJournal.snapshot()[0]?.sourcePath==='AnimeList/Anime/Old.md';
 renameSession.renameSource('AnimeList/Anime/Old.md','AnimeList/Anime/Manual name.md');
 await delay(30);
 const relocated=renameJournal.snapshot();
 details.renameRelocatesPendingJournal=relocated.length===1 && relocated[0]?.sourcePath==='AnimeList/Anime/Manual name.md';
 details.renameKeepsPendingVisibleOrder=renamedParticipant.current().join(',')===renamedDesired;
 renameSession.unregister(renamedParticipant);
 await delay(720);
 details.oldSourceParticipantFlushesToRenamedNote=renameCommits.length===1
  && renameCommits[0]?.sourcePath==='AnimeList/Anime/Manual name.md'
  && renameCommits[0]?.pending[0]?.paths.join(',')===renamedDesired;
 details.renameLeavesNoStaleJournal=renameJournal.snapshot().length===0;
 renameSession.dispose();

 const crashJournal=makeJournal();
 const crashCommitter={async commitPendingSectionOrders(){throw new Error('should-not-flush-visible')}};
 const crashA=new AnimeListOrderSession.ImageSectionOrderSession(crashJournal,crashCommitter); await crashA.initialize();
 const crashP=participant(['a.jpg','b.jpg','c.jpg']); crashP.applyPaths(crashA.register(crashP));
 await AnimeListOrderSession.moveImageSectionAsset({orderSession:crashA,source:crashP,target:crashP,path:'c.jpg',targetPath:'a.jpg',placement:'before'});
 const crashDesired=crashP.current().join(',');
 crashA.dispose();
 const crashB=new AnimeListOrderSession.ImageSectionOrderSession(crashJournal,crashCommitter); await crashB.initialize();
 const recovered=participant(['a.jpg','b.jpg','c.jpg']); recovered.applyPaths(crashB.register(recovered));
 details.crashRecoveryRestoresPendingOrder=recovered.current().join(',')===crashDesired;
 crashB.dispose();

 const failedJournal=makeJournal(); failedJournal.stats.fail=true;
 const failedSession=new AnimeListOrderSession.ImageSectionOrderSession(failedJournal,{async commitPendingSectionOrders(){}}); await failedSession.initialize();
 const failedP=participant(['a.jpg','b.jpg','c.jpg']); failedP.applyPaths(failedSession.register(failedP));
 const failure=await AnimeListOrderSession.moveImageSectionAsset({orderSession:failedSession,source:failedP,target:failedP,path:'c.jpg',targetPath:'a.jpg',placement:'before'});
 details.journalFailureRollsBackUndurableUi=failure.status==='failed' && failedP.current().join(',')==='a.jpg,b.jpg,c.jpg' && failedJournal.snapshot().length===0;
 failedSession.dispose();
 document.body.dataset.details=JSON.stringify(details);
 document.body.dataset.result=Object.values(details).every(Boolean)?'pass':'fail';
})().catch((error)=>{document.body.dataset.details=String(error?.stack||error);document.body.dataset.result='fail'});
</script></body></html>`;

try {
  await runChromiumDatasetTest({
    html,
    profile,
    testName: "Image Section stable order session",
    requireEnvironment: "ANIMELIST_REQUIRE_CHROMIUM",
    viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
    resultTimeoutMs: 15000,
  });
} finally {
  await rm(output, { recursive: true, force: true });
  stop();
}

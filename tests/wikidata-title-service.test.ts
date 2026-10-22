import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WikidataTitleService, parseWikidataTitleEvidence } from "../src/data/wikidata-title-service";
import { localizeExternalMediaResult } from "../src/data/media-title-service";
import { withActiveLocale } from "../src/i18n/catalog";
import { normalizeAniListMedia, normalizeBangumiSubject } from "../src/data/provider-normalizers";
import { buildMediaMarkdown } from "../src/data/media-note-codec";
import type { ExternalMediaResult, MediaNoteForm } from "../src/domain/media-types";

const qid = "Q232246";
function source(type: "anime" | "manga" = "anime"): ExternalMediaResult {
  return withActiveLocale("en", () => normalizeAniListMedia({
    id: 42, countryOfOrigin: "JP",
    title: { english: "Original English", native: "日本語原題", romaji: "Nihongo Gendai" },
  }, type));
}
function matches(items: string[] = [qid]) {
  return { results: { bindings: items.map(item => ({
    item: { type: "uri", value: "https://www.wikidata.org/entity/" + item },
  })) } };
}
function entity(labels: Record<string,string>, sitelinks: Record<string,string> = {}) {
  return { entities: { [qid]: {
    labels: Object.fromEntries(Object.entries(labels).map(([key,value]) =>
      [key,{ language:key, value }])),
    sitelinks: Object.fromEntries(Object.entries(sitelinks).map(([key,title]) =>
      [key,{ site:key, title }])),
  } } };
}
function markdown(media: ExternalMediaResult, title = media.title): string {
  const form: MediaNoteForm = {
    title, status:"planned", releaseStatus:"unknown", progress:0, total:12, unit:"episode",
    score:null, favorite:false, startedAt:"", completedAt:"", genres:[],
    templatePath:"", volumeLog:[],
  };
  return buildMediaMarkdown(media,form,"","");
}

describe("external-ID Wikidata title evidence", () => {
  it("joins AniList anime ID to exactly one QID before adopting a locale-specific title", async () => {
    const urls: string[] = [];
    const svc = new WikidataTitleService(async url => {
      urls.push(url);
      return urls.length === 1 ? matches() : entity({ "zh-tw": "臺灣維基名稱" });
    });
    const original = source();
    const evidence = await svc.lookup(original, "zh-TW");
    assert.equal(evidence?.itemId, qid);
    assert.equal(evidence?.identityProperty, "P8729");
    assert.equal(evidence?.kind, "wikidata-label");
    assert.equal(evidence?.title, "臺灣維基名稱");
    assert.match(decodeURIComponent(urls[0]), /wdt:P8729 "42"/);
    assert.match(urls[1], /wbgetentities/);
    assert.equal((await svc.lookup(original,"zh-TW"))?.title, "臺灣維基名稱");
    assert.equal(urls.length,2);
    const localized = localizeExternalMediaResult({ ...original, wikidataTitleEvidence:evidence ?? undefined }, "zh-TW");
    assert.equal(localized.title,"臺灣維基名稱");
    assert.equal(localized.originalTitle,original.originalTitle);
    assert.equal(localized.titleVariants?.localized?.["zh-TW"],undefined);
    assert.match(markdown(localized), /title_external_evidence:/);
    assert.match(markdown(localized), /wikidata_id: "Q232246"/);
    assert.doesNotMatch(markdown(localized), /title_script_conversions:/);
    assert.doesNotMatch(markdown(localized,"使用者指定名稱"), /title_external_evidence:/);
  });

  it("uses a Chinese Wikipedia sitelink as an explicitly non-official conversion fallback", () => {
    const evidence = parseWikidataTitleEvidence(matches(),
      entity({}, {zhwiki:"辉夜大小姐想让我告白"}), source(), "zh-TW");
    assert.equal(evidence?.title,"輝夜大小姐想讓我告白");
    assert.equal(evidence?.kind,"script-conversion");
  });

  it("rejects missing and ambiguous identity rather than choosing the first text result", async () => {
    let calls = 0;
    const svc = new WikidataTitleService(async _url => { calls++; return matches([qid,"Q99"]); });
    assert.equal(await svc.lookup(source(),"zh-TW"),null);
    assert.equal(calls,1);
    const parsed = parseWikidataTitleEvidence(matches([]),entity({"zh-tw":"錯誤"}),source(),"zh-TW");
    assert.equal(parsed,null);
  });

  it("uses AniList manga and Bangumi exact property IDs, not source-name guessing", async () => {
    const ids:string[]=[];
    const svc = new WikidataTitleService(async url => {
      ids.push(decodeURIComponent(url));
      return ids.length%2===1 ? matches() : entity({ "zh-cn": "简体标签" });
    });
    const manga=source("manga");
    const bangumi=withActiveLocale("ja", () => normalizeBangumiSubject({
      id:88,name:"日本語原題",name_cn:"", infobox:[],
    },"anime"));
    assert.equal((await svc.lookup(manga,"zh-CN"))?.identityProperty,"P8731");
    assert.equal((await svc.lookup(bangumi,"zh-CN"))?.identityProperty,"P5732");
    assert.ok(ids[0].includes("wdt:P8731"));
    assert.ok(ids[2].includes("wdt:P5732"));
  });

  it("provider-verified titles take precedence over Wikidata; manual items are unchanged", () => {
    const original={ ...source(), titleVariants: {
      fallback:"Original English", localized: {"zh-TW":"正式譯名"},
    }, wikidataTitleEvidence:{
      title:"維基百科標題",locale:"zh-TW" as const,
      itemId:qid, kind:"wikipedia-title" as const, identityProperty:"P8729",
    } };
    assert.equal(localizeExternalMediaResult(original,"zh-TW").title,"正式譯名");
    const manual={...original,provider:"manual",title:"自己取名"};
    assert.equal(localizeExternalMediaResult(manual,"zh-TW").title,"自己取名");
  });

  it("deduplicates simultaneous lookups for one ID",async()=>{
    let calls=0;
    const svc=new WikidataTitleService(async _url => {
      calls++;
      await Promise.resolve();
      return calls===1?matches():entity({"zh-tw":"中文標題"});
    });
    const results=await Promise.all(Array.from({length:5},()=>svc.lookup(source(),"zh-TW")));
    assert.deepEqual(results.map(x=>x?.title),Array(5).fill("中文標題"));
    assert.equal(calls,2);
  });
});

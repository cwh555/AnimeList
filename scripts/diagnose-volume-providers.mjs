import fs from "node:fs/promises";
const title="ロクでなし魔術講師と禁忌教典";
const report={started:new Date().toISOString(),requests:[]};
const headers={"User-Agent":"AnimeList/1.6.3 (https://github.com/cwh555/AnimeList; one-time diagnostic)",Accept:"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function probe(name,url,options={}){
 const start=Date.now();let result;
 try{const res=await fetch(url,{headers,...options,signal:AbortSignal.timeout(12000)});const body=await res.text();let data;try{data=JSON.parse(body)}catch{data=body.slice(0,1000000)};result={name,url,status:res.status,ms:Date.now()-start,data};}
 catch(e){result={name,url,ms:Date.now()-start,error:String(e),cause:String(e.cause??"")};}
 report.requests.push(result);return result;
}
const ol=(q,fields="key,title,cover_i,isbn,edition_key,editions,author_name",limit=20)=>"https://openlibrary.org/search.json?"+new URLSearchParams({title:q,fields,limit:String(limit)});
const bg=(q,offset=0)=>probe("bangumi-search:"+q+":"+offset,"https://api.bgm.tv/v0/search/subjects?limit=50&offset="+offset,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({keyword:q,sort:"match",filter:{type:[1],nsfw:false}})});
const gb=q=>probe("google-books:"+q,"https://www.googleapis.com/books/v1/volumes?"+new URLSearchParams({q,maxResults:"20",printType:"books"}));
const rows=await Promise.all([
 (async()=>{const r=await probe("bangumi-relations","https://api.bgm.tv/v0/subjects/109635/subjects");await sleep(1100);await bg(title);for(const n of [1,12,24,25,26]){await sleep(1100);await bg(title+" "+n);}})(),
 (async()=>{for(const q of [title,"Akashic Records of Bastard Magic Instructor",title+" 24"]){await probe("openlibrary-search:"+q,ol(q));await sleep(1100);}for(const id of ["OL24202662W","OL39463515W"]){await probe("openlibrary-editions:"+id,"https://openlibrary.org/works/"+id+"/editions.json?limit=50");await sleep(1100);}await probe("openlibrary-isbn","https://openlibrary.org/isbn/9784040751849.json");})(),
 (async()=>{for(const q of [title,title+" 24","isbn:9784040751849"]){await gb(q);await sleep(1100);}})(),
 probe("ndl-isbn","https://ndlsearch.ndl.go.jp/api/opensearch?isbn=9784040751849",{headers:{...headers,Accept:"application/xml"}})
]);
function brief(r){const d=r.data;const items=Array.isArray(d)?d:Array.isArray(d?.data)?d.data:Array.isArray(d?.docs)?d.docs:Array.isArray(d?.entries)?d.entries:Array.isArray(d?.items)?d.items:[];return {name:r.name,status:r.status,error:r.error,cause:r.cause,ms:r.ms,total:d?.total??d?.numFound??d?.totalItems??d?.size,items:items.slice(0,50).map(x=>({id:x.id??x.key,title:x.name??x.title??x.volumeInfo?.title,relation:x.relation,cover:x.images?.large??x.cover_i??x.covers??x.volumeInfo?.imageLinks?.thumbnail,isbn:x.isbn_13??x.volumeInfo?.industryIdentifiers})),single:!items.length&&d&&typeof d==="object"?JSON.stringify(d).slice(0,600):undefined,xml:typeof d==="string"?d.slice(0,450):undefined};}
await fs.mkdir("volume-benchmark",{recursive:true});await fs.writeFile("volume-benchmark/raw.json",JSON.stringify(report,null,2));const summary=report.requests.map(brief);await fs.writeFile("volume-benchmark/summary.json",JSON.stringify(summary,null,2));for(const r of summary)console.log(JSON.stringify(r));console.log("HTTP success:",report.requests.filter(r=>r.status>=200&&r.status<300).length,"/",report.requests.length);

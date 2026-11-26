import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("protocol-audit",{recursive:true});
await build({
  stdin:{contents:`
import { createMetadataProviderClients } from "./src/data/metadata-provider-clients";
import { SerialVolumeCatalogService } from "./src/data/serial-covers/volume-catalog-service";
import { setRequestUrlMock } from "./tests/mocks/obsidian";
globalThis.window=globalThis;
const requests=[];
setRequestUrlMock(async options=>{
  const t=Date.now();
  const response=await fetch(options.url,{method:options.method,headers:options.headers,body:options.body,signal:AbortSignal.timeout(18000)});
  const text=await response.text();
  requests.push({url:options.url,status:response.status,ms:Date.now()-t});
  if(!response.ok)throw new Error("HTTP "+response.status);
  return {json:JSON.parse(text),text,status:response.status};
});
const title="ロクでなし魔術講師と禁忌教典";
const clients=createMetadataProviderClients();
const catalog=new SerialVolumeCatalogService(()=>({bangumi:true,anilist:false,openlibrary:false}),clients);
const request={mediaType:"novel",originalTitle:title,queryTitle:title,aliases:[],sources:[{provider:"bangumi",sourceId:"109635",sourceUrl:""}],manual:false};
const result=[];
for(let n=1;n<=26;n++){
  const r=await catalog.search({...request,label:String(n)});
  result.push({volume:n,verified:r.verified.map(x=>({id:x.sourceId,title:x.title,cover:x.coverUrl})),warnings:r.warnings});
}
console.log("LIVE_CATALOG",JSON.stringify({result,requests}));
let failures=0;for(const item of result){if(item.volume<=24?item.verified.length!==1:item.verified.length!==0)failures++;}
const images=[];
for(const x of result.slice(0,24)){
  if(!x.verified[0])continue;
  try{
    const response=await fetch(x.verified[0].cover,{signal:AbortSignal.timeout(12000),headers:{"User-Agent":"cwh555/AnimeList diagnostic (https://github.com/cwh555/AnimeList)"}});
    const b=new Uint8Array(await response.arrayBuffer());
    images.push({volume:x.volume,status:response.status,bytes:b.length,jpeg:b[0]===255&&b[1]===216});
  }catch(e){images.push({volume:x.volume,error:String(e)});}
}
console.log("LIVE_IMAGES",JSON.stringify(images));
console.log("OPEN_LIBRARY_EDITIONS",JSON.stringify(await clients.openlibrary.fetchWorkEditions("OL24202662W","Spice and Wolf, Volume 17: Epilogue")));
if(failures)throw new Error("Live volume identity mismatch: "+failures);
`,resolveDir:process.cwd(),loader:"ts"},
  bundle:true,platform:"node",format:"esm",outfile:"protocol-audit/live.mjs",
  alias:{obsidian:process.cwd()+"/tests/mocks/obsidian.ts"},logLevel:"warning"
});
await import("../protocol-audit/live.mjs");

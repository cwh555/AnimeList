import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("protocol-audit/images",{recursive:true});
await build({
stdin:{contents:`
import { writeFile } from "node:fs/promises";
import { createMetadataProviderClients } from "./src/data/metadata-provider-clients";
import { SerialVolumeCatalogService } from "./src/data/serial-covers/volume-catalog-service";
import { remoteCoverExtension } from "./src/domain/remote-cover-format";
import { setRequestUrlMock } from "./tests/mocks/obsidian";
globalThis.window=globalThis;
const requests=[];
setRequestUrlMock(async options=>{
 const t=Date.now();
 try {
  const r=await fetch(options.url,{method:options.method,headers:options.headers,body:options.body,signal:AbortSignal.timeout(12000)});
  const body=await r.text();
  requests.push({url:options.url,status:r.status,ms:Date.now()-t});
  if(!r.ok)throw new Error("HTTP "+r.status);
  return {json:JSON.parse(body),text:body,status:r.status};
 } catch(e) {requests.push({url:options.url,error:String(e),ms:Date.now()-t});throw e;}
});
const clients=createMetadataProviderClients();
const bg=new SerialVolumeCatalogService(()=>({bangumi:true,anilist:false,openlibrary:false}),clients);
const ol=new SerialVolumeCatalogService(()=>({bangumi:false,anilist:false,openlibrary:true}),clients);
const cases=[
 {name:"rokudenashi",mediaType:"novel",originalTitle:"ロクでなし魔術講師と禁忌教典",sources:[{provider:"bangumi",sourceId:"109635",sourceUrl:""}],labels:Array.from({length:26},(_,i)=>String(i+1))},
 {name:"mushoku",mediaType:"novel",originalTitle:"無職転生 ～異世界行ったら本気だす～",sources:[],labels:Array.from({length:26},(_,i)=>String(i+1))},
 {name:"frieren",mediaType:"manga",originalTitle:"葬送のフリーレン",sources:[],labels:["1","5","10"]},
 {name:"bocchi",mediaType:"manga",originalTitle:"ぼっち・ざ・ろっく！",sources:[],labels:["1","3","5"]},
];
const results=[];
for(const c of cases){
 const out=[];
 for(const label of c.labels){
  const r=await bg.search({mediaType:c.mediaType,originalTitle:c.originalTitle,queryTitle:c.originalTitle,aliases:[],sources:c.sources,label,manual:false});
  out.push({label,verified:r.verified.map(x=>({id:x.sourceId,title:x.title,url:x.coverUrl})),warnings:r.warnings});
 }
 const result={name:c.name,mediaType:c.mediaType,out};
 results.push(result);
 console.log("LIVE_SERIES "+JSON.stringify(result));
}
const edition=await ol.search({mediaType:"novel",originalTitle:"狼と香辛料",queryTitle:"Spice and Wolf",aliases:[],sources:[],label:"17",manual:true});
console.log("LIVE_EDITION "+JSON.stringify(edition));
const downloads=[];
for(const c of results)for(const v of c.out)for(const item of v.verified)downloads.push({name:c.name+"-"+v.label+"-"+item.id,url:item.url});
for(const x of edition.alternatives)downloads.push({name:"openlibrary-17-"+x.sourceId,url:x.coverUrl});
const images=[];
for(let i=0;i<downloads.length;i+=4){
 await Promise.all(downloads.slice(i,i+4).map(async x=>{
  try{
   const r=await fetch(x.url,{signal:AbortSignal.timeout(15000),headers:{"User-Agent":"cwh555/AnimeList diagnostic (https://github.com/cwh555/AnimeList)"}});
   if(!r.ok)throw new Error("HTTP "+r.status);
   const data=await r.arrayBuffer();const ext=remoteCoverExtension(data);
   const path="protocol-audit/images/"+x.name.replace(/[^a-zA-Z0-9_-]/g,"_")+"."+ext;
   await writeFile(path,new Uint8Array(data));images.push({name:x.name,path,status:r.status,bytes:data.byteLength,ext});
  }catch(e){images.push({name:x.name,error:String(e)});}
 }));
}
console.log("LIVE_IMAGE_DOWNLOADS "+JSON.stringify(images));
console.log("LIVE_REQUESTS "+JSON.stringify(requests));
await writeFile("protocol-audit/results.json",JSON.stringify({results,edition,images,requests},null,2));
const first=results[0].out;
if(first.some(v=>Number(v.label)<=24?v.verified.length!==1:v.verified.length!==0)||results.slice(1).some(c=>c.out.some(v=>v.verified.length!==1))||edition.alternatives.length!==3||images.some(x=>x.error)||images.length!==59)process.exitCode=1;
`,resolveDir:process.cwd(),loader:"ts"},
bundle:true,platform:"node",format:"esm",outfile:"protocol-audit/live.mjs",alias:{obsidian:process.cwd()+"/tests/mocks/obsidian.ts"},logLevel:"warning"});
await import("../protocol-audit/live.mjs");

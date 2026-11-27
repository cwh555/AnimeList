const ua="cwh555/AnimeList diagnostic (https://github.com/cwh555/AnimeList)";
async function query(url, options={}) {
 const r=await fetch(url,{...options,headers:{"User-Agent":ua,Accept:"application/json",...options.headers},signal:AbortSignal.timeout(18000)});
 return {status:r.status,body:await r.json()};
}
for(const title of ["無職転生 ～異世界行ったら本気だす～","無職転生","無職転生 20"]){
 const r=await query("https://api.bgm.tv/v0/search/subjects?limit=20&offset=0",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keyword:title,sort:"match",filter:{type:[1],nsfw:false}})});
 console.log("BG_RAW "+JSON.stringify({title,status:r.status,total:r.body.total,data:r.body.data?.map(x=>({id:x.id,name:x.name,name_cn:x.name_cn,platform:x.platform,meta_tags:x.meta_tags}))}));
}
for(const [title,mode] of [["Spice and Wolf","title"],["Spice and Wolf 17","title"],["Spice and Wolf, Volume 17","title"],["Spice and Wolf 17","q"],["Spice and Wolf, Vol. 17","q"]]){
 const r=await query("https://openlibrary.org/search.json?"+new URLSearchParams({[mode]:title,fields:"key,title,cover_i,editions,editions.key,editions.title,editions.isbn,editions.cover_i",limit:"50"}));
 console.log("OL_RAW "+JSON.stringify({title,mode,status:r.status,numFound:r.body.numFound,docs:r.body.docs?.map(x=>({key:x.key,title:x.title,cover_i:x.cover_i,editionTitles:x.editions?.docs?.slice(0,3).map(y=>y.title)}))}));
}

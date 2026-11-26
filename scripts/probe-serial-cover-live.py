import concurrent.futures as cf
import json, time, urllib.request as u, urllib.parse as p, urllib.error as e, pathlib, re, unicodedata
T="ロクでなし魔術講師と禁忌教典"
ISBN="9784040702315 9784040702322 9784040705156 9784040705163 9784040705170 9784040709741 9784040709758 9784040709765 9784040724171 9784040724195 9784040724201 9784040727226 9784040727233 9784040727240 9784040732725 9784040732732 9784040737362 9784040737379 9784040741475 9784040740287 9784040745794 9784040745800 9784040751436 9784040751849".split()
# Ground truth: Bangumi /subject/109635/offprints and Japanese ISBN table;
# verify each ISBN checksum, and sample against publisher. Never infer volume by order of API results.
OUT=pathlib.Path("probe-results"); OUT.mkdir(exist_ok=True)
def get(name,url,body=None,image=False):
    start=time.monotonic()
    try:
        req=u.Request(url, data=json.dumps(body,ensure_ascii=False).encode() if body else None,headers={"User-Agent":"cwh555/AnimeList diagnostic (https://github.com/cwh555/AnimeList)","Accept":"image/*" if image else "application/json, application/xml, text/xml, */*","Content-Type":"application/json"})
        with u.urlopen(req,timeout=18) as r:
            data=r.read(4*1024*1024); status=r.status; typ=r.headers.get("Content-Type","")
        if image:
            return {"status":status,"type":typ,"bytes":len(data),"ms":round((time.monotonic()-start)*1000)}
        try: parsed=json.loads(data)
        except Exception: parsed=data.decode("utf8",errors="replace")
        (OUT/(name+".json")).write_text(json.dumps(parsed,ensure_ascii=False,indent=2))
        return {"status":status,"ms":round((time.monotonic()-start)*1000),"data":parsed}
    except e.HTTPError as ex:
        return {"status":ex.code,"error":str(ex),"ms":round((time.monotonic()-start)*1000)}
    except Exception as ex:
        return {"status":None,"error":str(ex),"ms":round((time.monotonic()-start)*1000)}
def url(base,**params):return base+"?"+p.urlencode(params)
def norm(s):return re.sub(r"[\s()（）]+","",unicodedata.normalize("NFKC",str(s)))
def vol(s):
    m=re.fullmatch(re.escape(norm(T))+r"(\d+)(?:巻)?",norm(s))
    return int(m.group(1)) if m else None
def base(r):return {k:v for k,v in r.items() if k!="data"}
def report(name,r,rows):
    out={**base(r),"count":len(rows),"rows":rows}
    (OUT/(name+"-summary.json")).write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(name,json.dumps(out,ensure_ascii=False),flush=True)
    return out
def bg_rows(d):
    return [{"id":x.get("id"),"title":x.get("name"),"volume":vol(x.get("name")),"relation":x.get("relation"),"platform":x.get("platform"),"image":bool(x.get("images",{}).get("large") or x.get("images",{}).get("common"))} for x in d if isinstance(x,dict)]
def bangumi():
    r=get("bg-rel","https://api.bgm.tv/v0/subjects/109635/subjects")
    d=r.get("data",[]); report("bg-rel",r,bg_rows(d if isinstance(d,list) else []))
    time.sleep(1)
    for n in [None,1,12,24,25,26]:
        for size in ([8,50] if n in [None,24] else [8]):
            name=f"bg-search-{n}-{size}"
            r=get(name,url("https://api.bgm.tv/v0/search/subjects",limit=size,offset=0),{"keyword":T+(" "+str(n) if n else ""),"sort":"match","filter":{"type":[1],"nsfw":False}})
            d=r.get("data",{}); report(name,r,bg_rows(d.get("data",[]) if isinstance(d,dict) else [])); time.sleep(1)
def ol_rows(d):
    return [{"key":x.get("key"),"title":x.get("title"),"volume":vol(x.get("title")),"cover":x.get("cover_i"),"isbn":x.get("isbn",[])[:4],"editions":x.get("editions",{}).get("docs",[])[:2]} for x in d if isinstance(x,dict)]
def openlib():
    fields="key,title,author_name,first_publish_year,cover_i,subject,isbn,edition_key,editions,editions.key,editions.title,editions.isbn,editions.cover_i"
    for name,q,limit in [("series-jp",T,50),("series-zh","不正經的魔術講師與禁忌教典",50),("series-en","Akashic Records of Bastard Magic Instructor",50),("24-jp",T+" 24",8),("24-expanded",T+"24",50),("spice","Spice and Wolf Volume 17",20),("bookworm","Ascendance of a Bookworm Part 5 Volume 12",20)]:
        r=get("ol-"+name,url("https://openlibrary.org/search.json",title=q,fields=fields,limit=limit,lang="zh"))
        d=r.get("data",{}); report("ol-"+name,r,ol_rows(d.get("docs",[]) if isinstance(d,dict) else [])); time.sleep(1.1)
    for i in [0,11,23]:
        isbn=ISBN[i]
        r=get("ol-isbn-"+str(i+1),"https://openlibrary.org/isbn/"+isbn+".json")
        d=r.get("data",{}); report("ol-isbn-"+str(i+1),r,[{k:d.get(k) for k in ["key","title","isbn_13","covers","works"]}] if isinstance(d,dict) and "key" in d else []);time.sleep(1.1)
        r=get("ol-cover-"+str(i+1),"https://covers.openlibrary.org/b/isbn/"+isbn+"-M.jpg?default=false",image=True);report("ol-cover-"+str(i+1),r,[]);time.sleep(1.1)
def google():
    for name,q in [("title",T+" 24"),("isbn","isbn:"+ISBN[23])]:
        r=get("gb-"+name,url("https://www.googleapis.com/books/v1/volumes",q=q,maxResults=20))
        d=r.get("data",{});report("gb-"+name,r,[{"id":x.get("id"),"title":x.get("volumeInfo",{}).get("title"),"isbn":x.get("volumeInfo",{}).get("industryIdentifiers"),"images":x.get("volumeInfo",{}).get("imageLinks")} for x in d.get("items",[])] if isinstance(d,dict) else []);time.sleep(1)
def ndl():
    r=get("ndl-title",url("https://ndlsearch.ndl.go.jp/api/opensearch",title=T,cnt=100))
    d=r.get("data","");report("ndl-title",r,[{"isbn":v} for v in ISBN if v in str(d) or v[:3]+"-"+v[3:4]+"-"+v[4:6]+"-"+v[6:12]+"-"+v[12:] in str(d)])
    r=get("ndl-isbn24",url("https://ndlsearch.ndl.go.jp/api/opensearch",isbn=ISBN[23]));report("ndl-isbn24",r,[{"snippet":str(r.get("data",""))[:500]}])
with cf.ThreadPoolExecutor(max_workers=4) as pool:
    for f in [pool.submit(x) for x in [bangumi,openlib,google,ndl]]:
        try:f.result()
        except Exception as ex:print("PROBE ERROR",repr(ex),flush=True)

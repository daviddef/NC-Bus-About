#!/usr/bin/env python3
"""Build qa/planner.html: type a place or address, see which afternoon bus to catch from school.

usage: python3 -I scripts/build_planner.py <stop_matches.json> <segment_stops.json> <raw_dir> <out.html> [osrm_cache.json]

PROTOTYPE. Route lines and times are ESTIMATES: the College sheets give only the afternoon departure time.
Each run's PM route is driven once (public OSRM, cached) from the school through its confidently matched
stops; the bus is assumed BUS_FACTOR x slower than a car. Decisions saved by the QA page in the same browser
(accepted / corrected stops, segments marked wrong or "no council stops") are applied at run time.
"""
import json, re, sys, time, urllib.request
from pathlib import Path

SCHOOL = (-27.3595, 153.0640)
OSRM = "https://router.project-osrm.org/route/v1/driving/"


def route(pts, cache, cpath):
    key = ";".join(f"{lon:.5f},{lat:.5f}" for lat, lon in pts)
    if key in cache:
        return cache[key]
    try:
        with urllib.request.urlopen(OSRM + key + "?overview=full&geometries=geojson", timeout=60) as r:
            j = json.load(r)
        rt = j["routes"][0]
        out = {"g": [[round(c[1], 5), round(c[0], 5)] for c in rt["geometry"]["coordinates"]], "dur": rt["duration"], "dist": rt["distance"], "ok": True}
    except Exception as e:  # straight lines, flagged
        print("  routing failed:", e)
        out = {"g": [[a, b] for a, b in pts], "dur": 0, "dist": 0, "ok": False}
    if out["ok"]:
        cache[key] = out
        Path(cpath).write_text(json.dumps(cache))
    time.sleep(1.1)
    return out


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Which bus home?</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
:root{--bg:#fff;--fg:#14213d;--mut:#5b6679;--line:#d6dce8;--blue:#0b3d91;--pan:#f4f6fb;--ok:#1b7f3b;--warn:#b26a00;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#10151f;--fg:#e8ecf5;--mut:#9aa6bd;--line:#2a3347;--blue:#7aa2ff;--pan:#171e2c;--ok:#5fd18a;--warn:#f0b24a;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg);display:grid;grid-template-columns:440px 1fr;height:100vh}
#side{display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--pan);min-height:0}
header{background:var(--blue);color:#fff;padding:14px 16px}header h1{margin:0;font-size:20px}header p{margin:2px 0 0;opacity:.85;font-size:13px}
form{display:flex;gap:8px;padding:12px 14px 6px}input[type=text]{flex:1;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}
button{font:inherit;padding:12px 16px;border:0;border-radius:10px;background:var(--blue);color:#fff;font-weight:600;cursor:pointer}
#opts{display:none;gap:8px;padding:0 14px 6px;flex-wrap:wrap}#opts label{font-size:12px;color:var(--mut);display:grid;gap:2px;flex:1;min-width:150px}
select{font:inherit;font-size:14px;padding:7px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
#out{overflow:auto;padding:0 14px 14px;flex:1}.card{background:var(--bg);border:2px solid var(--line);border-radius:12px;padding:10px 12px;margin:10px 0}
.card.on{border-color:var(--c)}.card h2{margin:0;font-size:17px;display:flex;gap:8px;align-items:center}.card h2 input{width:20px;height:20px;accent-color:var(--c)}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--c)}
.times{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:6px 0;font-size:15px}.times b{font-size:17px}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:10px;border:1px solid currentColor;margin:2px 4px 0 0}.ok{color:var(--ok)}.warn{color:var(--warn)}
.banner{border:2px solid var(--warn);border-radius:10px;padding:6px 10px;margin-top:8px;color:var(--warn);font-weight:600;font-size:14px}
.note{color:var(--mut);font-size:13px}a{color:var(--blue)}#map{min-height:0}
.num{width:20px;height:20px;border-radius:50%;color:#fff;font:700 11px/20px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 0 2px #0008}
@media(max-width:800px){body{grid-template-columns:1fr;grid-template-rows:auto 45vh;height:auto}#map{height:45vh}}
</style></head><body>
<div id="side"><header><h1>Which bus home?</h1><p>From St Joseph&rsquo;s Nudgee College &middot; prototype with estimated times</p></header>
<form id="f"><input type="text" id="q" placeholder="Place or address, e.g. Westfield Chermside" autocomplete="off" required><button>Find bus</button></form>
<div id="opts"><label>Where to get off<select id="mode"><option value="quick">Quickest way there (bus + walk)</option><option value="close">Closest stop to destination</option></select></label>
<label>Sort by<select id="sort"><option value="arrive">Arrive soonest</option><option value="walk">Least walking</option><option value="bus">Shortest bus ride</option></select></label></div>
<div id="out"><p class="note" style="margin:6px 0">Type where you are going. Times are estimates worked out from road distance &mdash; the College sheets only give the 3:05 pm departure. Not yet checked by College Transport: always check BusMinder and your driver.</p></div></div>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const RUNS=__DATA__;
const SCHOOL=[-27.3595, 153.0640],KEY="nudgee-qa-decisions-v1",BUS_FACTOR=1.3,MAX_OFF=250,PAL=["#1a56db","#e65100","#2e7d32","#8e24aa","#c2185b","#00838f","#6d4c41"];
let dec={};try{dec=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const map=L.map("map").setView(SCHOOL,11);
const ESRI="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
L.tileLayer(ESRI+"World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,maxNativeZoom:16,attribution:"Tiles &copy; Esri"}).addTo(map);
L.tileLayer(ESRI+"World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,maxNativeZoom:16,pane:"shadowPane"}).addTo(map);
L.circleMarker(SCHOOL,{radius:7,color:"#0b3d91",fillOpacity:.9}).addTo(map).bindTooltip("Nudgee College (start)");
const layer=L.layerGroup().addTo(map);
const rad=x=>x*Math.PI/180;
function dist(a,b){const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2;return 12742000*Math.asin(Math.sqrt(h))}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const hhmm=m=>{const h=Math.floor(m/60)%24,mm=Math.round(m%60);const H=mm===60?h+1:h,M=mm===60?0:mm;return((H%12)||12)+":"+String(M).padStart(2,"0")+(H%24>=12?" pm":" am")};
const fmt=d=>d<1000?Math.round(d/10)*10+" m":(d/1000).toFixed(1)+" km";
const mins=m=>m<1?"<1 min":Math.round(m)+" min";
// ---- run preparation: cumulative distance along the route
RUNS.forEach(r=>{const g=r.route.g;r.cum=[0];for(let i=1;i<g.length;i++)r.cum.push(r.cum[i-1]+dist(g[i-1],g[i]));r.total=r.cum[r.cum.length-1]||1;
 r.departMin=r.depart?(+r.depart.split(":")[0])*60+(+r.depart.split(":")[1]):905;
 r.secTotal=(r.route.ok&&r.route.dur?r.route.dur:r.total/8.3)*BUS_FACTOR});
function project(r,pt){let bi=0,bd=1e12;const g=r.route.g;for(let i=0;i<g.length;i++){const d=dist(g[i],pt);if(d<bd){bd=d;bi=i}}return{i:bi,off:bd}}
const etaMin=(r,i)=>r.secTotal/60*(r.cum[i]/r.total);   // minutes after leaving school
function points(r){const out=[];
 for(const p of r.points){let q;
  if(p.k==="stop"){const x=dec[p.id];let lat=p.lat,lon=p.lon,checked=false;
   if(x&&(x.kind==="accept"||x.kind==="custom")){lat=x.lat;lon=x.lon;checked=true}else if(x)continue;
   else if(p.status!=="strong"&&p.status!=="possible")continue;
   q={...p,lat,lon,checked,maybe:p.status==="possible"&&!checked}}
  else{const x=dec[p.segid];if(x&&(x.kind==="seg_wrong"||x.kind==="seg_none"))continue;q={...p,checked:!!x&&x.kind==="seg_ok"}}
  const pr=project(r,[q.lat,q.lon]);if(pr.off>MAX_OFF&&q.k==="seg")continue;
  q.i=pr.i;q.off=pr.off;q.eta=etaMin(r,pr.i);out.push(q)}
 return out}
// ---- planning
let dest=null,results=[],checked=new Set(),destName="";
function wmin(d){return d*1.3/80}   // 80 m per minute, plus 30% for streets
function plan(){const mode=document.getElementById("mode").value,sort=document.getElementById("sort").value,res=[];
 RUNS.forEach((r,ri)=>{const ps=points(r);if(!ps.length)return;let best=null;
  for(const p of ps){const d=dist([p.lat,p.lon],dest),w=wmin(d),tot=p.eta+w;const key=mode==="close"?d:tot;if(!best||key<best.key)best={p,d,w,tot,key}}
  res.push({r,ri,p:best.p,d:best.d,w:best.w,bus:best.p.eta,arrive:r.departMin+best.tot,get:r.departMin+best.p.eta,ps})});
 res.sort((a,b)=>sort==="walk"?a.w-b.w:sort==="bus"?a.bus-b.bus:a.arrive-b.arrive);
 res.forEach((x,i)=>x.col=PAL[i%PAL.length]);return res}
function show(){const out=document.getElementById("out");document.getElementById("opts").style.display="flex";
 const walkAll=wmin(dist(SCHOOL,dest));
 out.innerHTML=`<p class="note" id="where" style="margin:8px 0"></p>`+(walkAll<=60?`<p class="note">Walking all the way from school: about ${mins(walkAll)}.</p>`:"")+
 results.slice(0,6).map((x,i)=>{const bestHome=x.arrive-x.r.departMin;
  const flag=x.w>15?`<div class="banner">Gets you part-way only: ${fmt(x.d)} still to go (${mins(x.w)} walk). Ask someone to pick you up, or plan the walk.</div>`:"";
  return `<div class="card ${checked.has(x.r.key)?"on":""}" style="--c:${x.col}" data-k="${x.r.key}"><h2><input type="checkbox" ${checked.has(x.r.key)?"checked":""}><span class="sw"></span>${esc(x.r.name)}${i===0?' <span class="chip ok">Best</span>':""}</h2>
  <div class="times"><span>Leave school</span><b>${hhmm(x.r.departMin)}</b>
  <span>Get off</span><b>${hhmm(x.get)} <span class="note">(${mins(x.bus)} on the bus)</span></b>
  <span>Reach destination</span><b>${hhmm(x.arrive)} <span class="note">(${mins(x.w)} walk, ${fmt(x.d)})</span></b></div>
  <div>${x.p.k==="seg"?"Stop on <b>"+esc(x.p.road)+"</b>: ":""}<b>${esc(x.p.t)}</b> <span class="note">(TransLink stop)</span></div>
  <div>${x.p.checked?'<span class="chip ok">stop checked</span>':'<span class="chip warn">stop not yet checked</span>'}${x.p.maybe?'<span class="chip warn">match uncertain</span>':""}<span class="chip warn">times estimated</span>${x.r.updated?`<span class="chip ${/20(2[56])/.test(x.r.updated)?"ok":"warn"}">sheet updated ${esc(x.r.updated)}</span>`:""}</div>${flag}</div>`}).join("")||"<p>No run found near there.</p>";
 out.querySelectorAll(".card").forEach(c=>c.querySelector("input").onchange=e=>{e.target.checked?checked.add(c.dataset.k):checked.delete(c.dataset.k);show();draw(false)});
 }
function bearing(a,b){const y=Math.sin(rad(b[1]-a[1]))*Math.cos(rad(b[0])),x=Math.cos(rad(a[0]))*Math.sin(rad(b[0]))-Math.sin(rad(a[0]))*Math.cos(rad(b[0]))*Math.cos(rad(b[1]-a[1]));return(Math.atan2(y,x)*180/Math.PI+360)%360}
function draw(fit){layer.clearLayers();if(!dest)return;const all=[SCHOOL,dest];
 L.marker(dest).addTo(layer).bindTooltip("Destination: "+destName,{permanent:true,direction:"right"});
 results.filter(x=>checked.has(x.r.key)).forEach(x=>{const r=x.r,g=r.route.g,col=x.col;
  // route (only up to the get-off stop is "your ride"; the rest is faded)
  const mine=g.slice(0,x.p.i+1),rest=g.slice(x.p.i);
  L.polyline(rest,{color:col,weight:3,opacity:.35,dashArray:"2 6"}).addTo(layer);
  const line=L.polyline(mine,{color:col,weight:5,opacity:.9}).addTo(layer);
  const hit=L.polyline(g,{color:col,weight:20,opacity:0}).addTo(layer);
  hit.on("click",e=>{const pr=project(r,[e.latlng.lat,e.latlng.lng]);let nb=null;for(const p of x.ps){const d=dist([p.lat,p.lon],[e.latlng.lat,e.latlng.lng]);if(!nb||d<nb.d)nb={p,d}}
   L.popup().setLatLng(e.latlng).setContent(`<b>${esc(r.name)}</b><br>Bus is here about <b>${hhmm(r.departMin+etaMin(r,pr.i))}</b> (${mins(etaMin(r,pr.i))} after leaving school)<br>`+(nb&&nb.d<=250?`Nearest stop: <b>${esc(nb.p.t)}</b> (${fmt(nb.d)}), about ${hhmm(r.departMin+nb.p.eta)}`:"No listed stop within 250 m")).openOn(map)});
  // direction arrows
  let acc=0;for(let i=1;i<mine.length;i++){acc+=dist(mine[i-1],mine[i]);if(acc>=500){acc=0;const b=bearing(mine[i-1],mine[i]);
   L.marker(mine[i],{interactive:false,icon:L.divIcon({className:"",iconSize:[16,16],iconAnchor:[8,8],html:`<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(${b}deg)"><path d="M8 1 L14 14 L8 10.5 L2 14Z" fill="${col}" stroke="#fff" stroke-width="1.5"/></svg>`})}).addTo(layer)}}
  // stops the bus uses (small dots), numbered named stops
  x.ps.filter(p=>p.i<=x.p.i&&p.k==="seg").forEach(p=>L.circleMarker([p.lat,p.lon],{radius:3,color:col,weight:1,fillColor:"#fff",fillOpacity:1}).addTo(layer).bindTooltip(`${p.t} · ${hhmm(r.departMin+p.eta)}`));
  let n=0;x.ps.filter(p=>p.k==="stop").sort((a,b)=>a.i-b.i).forEach(p=>{n++;L.marker([p.lat,p.lon],{icon:L.divIcon({className:"",iconSize:[20,20],iconAnchor:[10,10],html:`<div class="num" style="background:${col}">${n}</div>`})}).addTo(layer).bindTooltip(`${n}. ${p.t} · about ${hhmm(r.departMin+p.eta)}`)});
  // get-off stop
  const here=[x.p.lat,x.p.lon];all.push(here,...g.slice(0,x.p.i+1).filter((_,i)=>i%12===0));
  L.circleMarker(here,{radius:9,color:col,weight:4,fillColor:"#fff",fillOpacity:1}).addTo(layer).bindTooltip(`${esc(r.name.split(" · ")[0])} — get off: ${esc(x.p.t)} · ${hhmm(x.get)}`,{permanent:true,direction:"top",offset:[0,-8]});
  L.polyline([here,dest],{color:"#b3261e",weight:3,dashArray:"3 6"}).addTo(layer).bindTooltip("Walk "+fmt(x.d)+" · "+mins(x.w))});
 if(fit)map.fitBounds(all,{padding:[50,50]})}
// ---- search
async function search(q){const out=document.getElementById("out");out.innerHTML='<p class="note">Searching&hellip;</p>';
 try{const u="https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=au&viewbox=152.3,-28.2,153.7,-26.6&q="+encodeURIComponent(q);
  const g=await(await fetch(u)).json();if(!g.length){out.innerHTML='<p>I could not find that place. Try adding the suburb.</p>';return}
  const pick=k=>{const t=g[k];dest=[+t.lat,+t.lon];destName=t.display_name.split(",").slice(0,2).join(",");results=plan();checked=new Set(results.slice(0,1).map(x=>x.r.key));show();
   document.getElementById("where").innerHTML="Buses to <b>"+esc(t.display_name.split(",").slice(0,3).join(","))+"</b>"+(g.length>1?"<br>Not right? "+g.map((a,j)=>j===k?"":`<a href="#" data-k="${j}">${esc(a.display_name.split(",").slice(0,2).join(","))}</a>`).filter(Boolean).join(" &middot; "):"");
   document.querySelectorAll("#where a").forEach(a=>a.onclick=ev=>{ev.preventDefault();pick(+a.dataset.k)});draw(true)};
  pick(0)}catch(err){out.innerHTML='<p>Search failed ('+esc(err.message)+'). Check your connection and try again.</p>'}}
document.getElementById("f").onsubmit=e=>{e.preventDefault();const q=document.getElementById("q").value.trim();if(q)search(q)};
["mode","sort"].forEach(id=>document.getElementById(id).onchange=()=>{if(!dest)return;results=plan();show();draw(false)});
</script></body></html>'''


def pm_time(t):
    """Some PM sheets write 3.05 for 15:05; an afternoon departure before noon is 12 h out."""
    h, m = t.split(":")
    return f"{int(h) + 12 if int(h) < 12 else int(h):02d}:{m}"


def name_of(title):
    t = re.sub(r"^AM\s+", "", title or "")
    m = re.match(r"RUN\s+(\w+)\s*[-‐]\s*(.+)", t, re.I)
    return f"Run {m.group(1)} · {m.group(2).title()}" if m else (t.title() if t else "Bus")


def build_runs(matches, segments, raw_dir, cache_path="data/osrm_cache.json"):
    matches = json.loads(Path(matches).read_text())
    segs = json.loads(Path(segments).read_text())
    cp = Path(cache_path)
    cache = json.loads(cp.read_text()) if cp.exists() else {}
    runs = []
    for f in sorted(Path(raw_dir).glob("*.json")):
        raw = json.loads(f.read_text())
        pm = next((t for t in raw["trips"] if t["label"] == "PM"), None)
        if not pm:
            continue
        pts, events = [], []
        for m in sorted((m for m in matches if m["run"] == f.stem and m["trip"] == "PM"), key=lambda m: m["seq"]):
            if not m["candidates"]:
                continue
            c = m["candidates"][0]
            pts.append({"k": "stop", "id": f"{f.stem}|PM|{m['seq']}", "t": m["text"], "lat": c["lat"], "lon": c["lon"], "status": m["status"]})
            if m["status"] == "strong":
                events.append((m["seq"], (c["lat"], c["lon"])))
        for g in segs:
            if g["run"] == f.stem and g["trip"] == "PM" and g["status"] == "found":
                sid = f"S|{f.stem}|PM|{g['seq']}"
                for s in g["stops"]:
                    pts.append({"k": "seg", "segid": sid, "t": s["name"], "road": g["road"], "lat": s["lat"], "lon": s["lon"]})
                # one waypoint per road: the stop nearest the middle of that road's candidates
                if g["stops"]:
                    la = sum(x["lat"] for x in g["stops"]) / len(g["stops"]); lo = sum(x["lon"] for x in g["stops"]) / len(g["stops"])
                    mid = min(g["stops"], key=lambda x: (x["lat"] - la) ** 2 + (x["lon"] - lo) ** 2)
                    events.append((g["seq"], (mid["lat"], mid["lon"])))
        anchors = []
        for _, pt in sorted(events):
            if not anchors or anchors[-1] != pt:
                anchors.append(pt)
        dep = next((i for i in pm["items"] if "time" in i and re.search(r"depart", i["text"], re.I)), None) or next((i for i in pm["items"] if "time" in i), None)
        print(f"{f.stem}: routing {len(anchors)} anchors")
        rt = route([SCHOOL] + anchors, cache, cp) if anchors else {"g": [list(SCHOOL)], "dur": 0, "dist": 0, "ok": False}
        runs.append({"key": f.stem, "name": name_of(raw["title"]), "updated": raw.get("updated"), "depart": pm_time(dep["time"]) if dep else None, "points": pts, "route": rt})
    return runs


def main(matches, segments, raw_dir, out, cache_path="data/osrm_cache.json"):
    runs = build_runs(matches, segments, raw_dir, cache_path)
    Path(out).write_text(TEMPLATE.replace("__DATA__", json.dumps(runs, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")))
    print(f"wrote {out}: {len(runs)} runs, {sum(len(r['points']) for r in runs)} points, routes ok: {sum(r['route']['ok'] for r in runs)}")


if __name__ == "__main__":
    main(*sys.argv[1:6])

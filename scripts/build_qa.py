#!/usr/bin/env python3
"""Build qa/index.html: a single-file stop-verification page.

usage: python3 -I scripts/build_qa.py <stop_matches.json> <raw_dir> <out.html> [segment_stops.json]
Embeds each matched stop (and, if given, each as-required road segment) with 2 sheet lines of context either side. Decisions live in the
browser (localStorage) and export as qa-decisions.json.
"""
import json, sys
from pathlib import Path

TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stop QA</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
:root{--bg:#fff;--fg:#14213d;--mut:#5b6679;--line:#d6dce8;--blue:#0b3d91;--pan:#f4f6fb;--ok:#1b7f3b;--warn:#b26a00;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#10151f;--fg:#e8ecf5;--mut:#9aa6bd;--line:#2a3347;--blue:#7aa2ff;--pan:#171e2c;--ok:#5fd18a;--warn:#f0b24a;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg);display:grid;grid-template-columns:340px 1fr;height:100vh}
#side{display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--pan);min-height:0}
#bar{padding:10px;border-bottom:1px solid var(--line);display:grid;gap:6px}
select,button,input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
button{cursor:pointer}button.pri{background:var(--blue);color:#fff;border-color:var(--blue)}
#list{overflow:auto;flex:1}
.row{padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer}.row.sel{background:color-mix(in srgb,var(--blue) 18%,transparent)}
.row small{color:var(--mut)}.tag{font-size:11px;padding:1px 6px;border-radius:9px;border:1px solid currentColor;margin-left:4px}
.strong,.found{color:var(--ok)}.possible,.ambiguous{color:var(--warn)}.none,.no_stops,.no_road{color:var(--bad)}
#main{display:grid;grid-template-rows:1fr auto;min-height:0}#map{min-height:0}
#card{border-top:1px solid var(--line);padding:10px 14px;max-height:42vh;overflow:auto;background:var(--pan)}
pre{margin:4px 0;padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;white-space:pre-wrap}
.cur{font-weight:700;color:var(--blue)}.cands{display:grid;gap:4px;margin:8px 0}.cand{display:flex;gap:8px;align-items:center}
.cand button{white-space:nowrap}.note{color:var(--mut);font-size:12px}
@media(max-width:800px){body{grid-template-columns:1fr;grid-template-rows:40vh 1fr}}
</style></head><body>
<div id="side"><div id="bar">
<select id="fRun"></select>
<select id="fStat"></select>
<select id="fDec"><option value="">All decisions</option><option value="todo">Not decided</option><option value="done">Decided</option></select>
<div id="count" class="note"></div><div class="note"><span style="color:#1a56db">&#9632;</span> AM &nbsp;<span style="color:#e65100">&#9632;</span> PM &nbsp;path = driving route between matched stops (approximate, not the College&#39;s own line)</div><div id="rnote" class="note"></div>
<button class="pri" id="export">Export decisions (JSON)</button></div>
<div id="list"></div></div>
<div id="main"><div id="map"></div><div id="card">Pick a stop on the left.</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const DATA=__DATA__;
const KEY="nudgee-qa-decisions-v1";
let dec={};try{dec=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(dec))}catch(e){}};
const id=d=>(d.seg?"S|":"")+d.run+"|"+d.trip+"|"+d.seq;
const map=L.map("map").setView([-27.34,153.07],11);
const ESRI="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
L.tileLayer(ESRI+"World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,maxNativeZoom:16,attribution:"Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"}).addTo(map);
L.tileLayer(ESRI+"World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,maxNativeZoom:16,pane:"shadowPane"}).addTo(map);
L.circleMarker([-27.3595, 153.0640],{radius:7,color:"#0b3d91",fillOpacity:.9}).addTo(map).bindTooltip("Nudgee College");
const layer=L.layerGroup().addTo(map);
const routeLayer=L.layerGroup().addTo(map);
const SCHOOL=[-27.3595, 153.0640],COL={AM:"#1a56db",PM:"#e65100"};
let routeTok=0;
function anchors(run,trip){return DATA.filter(d=>!d.seg&&d.run===run&&d.trip===trip).sort((a,b)=>a.seq-b.seq).map(d=>{const x=dec[id(d)];
 if(x&&(x.kind==="accept"||x.kind==="custom"))return{d,lat:x.lat,lon:x.lon};if(x)return null;
 return d.status==="strong"&&d.candidates[0]?{d,lat:d.candidates[0].lat,lon:d.candidates[0].lon}:null}).filter(Boolean)}
async function osrm(pts){const key="route|"+pts.map(p=>p.map(v=>v.toFixed(5)).join(",")).join(";");
 try{const c=localStorage.getItem(key);if(c)return JSON.parse(c)}catch(e){}
 const r=await fetch("https://router.project-osrm.org/route/v1/driving/"+pts.map(p=>p[1]+","+p[0]).join(";")+"?overview=full&geometries=geojson");
 const j=await r.json();if(!j.routes||!j.routes[0])throw new Error(j.code||"no route");
 const g=j.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);try{localStorage.setItem(key,JSON.stringify(g))}catch(e){}return g}
async function showRoutes(run,trips,fit){const tok=++routeTok;routeLayer.clearLayers();const all=[];const note=document.getElementById("rnote");note.textContent="";
 for(const trip of trips){if(trip!=="AM"&&trip!=="PM")continue;const a=anchors(run,trip);if(!a.length)continue;
  const col=COL[trip],pts=trip==="PM"?[SCHOOL,...a.map(p=>[p.lat,p.lon])]:[...a.map(p=>[p.lat,p.lon]),SCHOOL];all.push(...pts);
  a.forEach((p,i)=>L.circleMarker([p.lat,p.lon],{radius:5,color:col,fillColor:"#fff",fillOpacity:1,weight:2}).addTo(routeLayer).bindTooltip(`${trip} ${i+1}. ${p.d.text}${p.d.time?" · "+p.d.time:""}`));
  const dash=L.polyline(pts,{color:col,weight:2,dashArray:"4 6",opacity:.7}).addTo(routeLayer);
  try{const g=await osrm(pts);if(tok!==routeTok)return;routeLayer.removeLayer(dash);L.polyline(g,{color:col,weight:4,opacity:.85}).addTo(routeLayer)}
  catch(e){note.textContent="Road routing unavailable ("+e.message+"): showing straight lines between stops."}}
 if(fit&&all.length)map.fitBounds(all,{padding:[40,40]})}
const fRun=document.getElementById("fRun"),fStat=document.getElementById("fStat"),fDec=document.getElementById("fDec");
fStat.innerHTML='<option value="">All match types</option>'+[...new Set(DATA.map(d=>d.status))].map(r=>`<option>${r}</option>`).join("");
fRun.innerHTML='<option value="">All runs</option>'+[...new Set(DATA.map(d=>d.run))].map(r=>`<option>${r}</option>`).join("");
let cur=null;
function visible(){return DATA.filter(d=>(!fRun.value||d.run===fRun.value)&&(!fStat.value||d.status===fStat.value)&&(!fDec.value||(fDec.value==="done")===!!dec[id(d)]))}
function label(d){const x=dec[id(d)];return x?({accept:"✔ accepted",custom:"✎ custom",seg_ok:"✔ road looks right",seg_wrong:"✘ wrong area",seg_none:"∅ no council stops"}[x.kind]||"? unresolved"):""}
function renderList(){const v=visible();document.getElementById("count").textContent=v.length+" shown · "+Object.keys(dec).length+" decided of "+DATA.length;
 document.getElementById("list").innerHTML=v.map(d=>`<div class="row ${cur&&id(cur)===id(d)?"sel":""}" data-id="${id(d)}"><b>${d.text}</b><span class="tag ${d.status}">${d.status}</span><br><small>${d.run} · ${d.trip}${d.time?" · "+d.time:""} ${label(d)}</small></div>`).join("");
 document.querySelectorAll(".row").forEach(r=>r.onclick=()=>select(DATA.find(d=>id(d)===r.dataset.id)))}
function setDec(d,v){if(v)dec[id(d)]=v;else delete dec[id(d)];save();renderList();select(d,true)}
function select(d,keep){cur=d;layer.clearLayers();const pts=[];if(!keep)showRoutes(d.run,[d.trip],false);
 if(d.seg){d.candidates.forEach(c=>{L.circleMarker([c.lat,c.lon],{radius:5,color:"#0b3d91",fillOpacity:.6}).addTo(layer).bindTooltip(c.name);pts.push([c.lat,c.lon])});
  if(!keep&&pts.length)map.fitBounds(pts,{maxZoom:16,padding:[40,40]});
  const ctx=d.context.map(c=>(c.cur?"➤ ":"   ")+(c.time?c.time+"  ":"")+c.line).join("\n");
  document.getElementById("card").innerHTML=`<div><b>${d.text}</b> <span class="tag ${d.status}">${d.status}</span> <span class="note">${d.run} · ${d.trip} · ${d.candidates.length} TransLink stops shown</span></div><pre>${ctx.replace(/</g,"&lt;")}</pre>
  <div class="cand"><button data-k="seg_ok">Road and stops look right</button><button data-k="seg_wrong">Wrong area</button><button data-k="seg_none">No council stops</button><button data-k="unresolved">Unresolved</button><button data-k="">Clear</button><span class="note">${label(d)}</span></div>`;
  document.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>setDec(d,b.dataset.k?{kind:b.dataset.k,n_stops:d.candidates.length}:null));
  renderList();return}
 d.candidates.forEach((c,i)=>{const m=L.marker([c.lat,c.lon]).addTo(layer).bindTooltip(`${i+1}. ${c.name}`);pts.push([c.lat,c.lon]);m.on("click",()=>setDec(d,{kind:"accept",stop_id:c.stop_id,name:c.name,lat:c.lat,lon:c.lon}))});
 const x=dec[id(d)];if(x&&x.kind==="custom"){L.circleMarker([x.lat,x.lon],{radius:8,color:"#b3261e"}).addTo(layer);pts.push([x.lat,x.lon])}
 if(!keep&&pts.length)map.fitBounds(pts,{maxZoom:16,padding:[40,40]});
 const ctx=d.context.map(c=>(c.cur?"➤ ":"   ")+(c.time?c.time+"  ":"")+c.line).join("\n");
 document.getElementById("card").innerHTML=`<div><b>${d.text}</b> <span class="tag ${d.status}">${d.status}</span> <span class="note">${d.run} · ${d.trip}</span></div><pre>${ctx.replace(/</g,"&lt;")}</pre>
 <div class="cands">${d.candidates.map((c,i)=>`<div class="cand"><button data-a="${i}">Accept ${i+1}</button><span>${c.name} <span class="note">score ${c.score}</span></span></div>`).join("")||'<span class="note">No candidates.</span>'}</div>
 <div class="cand"><button id="bCustom">Set position by clicking map</button><button id="bUnres">Unresolved</button><button id="bClear">Clear decision</button><span class="note">${label(d)}${x&&x.name?" — "+x.name:""}</span></div>`;
 document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{const c=d.candidates[+b.dataset.a];setDec(d,{kind:"accept",stop_id:c.stop_id,name:c.name,lat:c.lat,lon:c.lon})});
 document.getElementById("bUnres").onclick=()=>setDec(d,{kind:"unresolved"});
 document.getElementById("bClear").onclick=()=>setDec(d,null);
 document.getElementById("bCustom").onclick=()=>{map.once("click",e=>setDec(d,{kind:"custom",lat:+e.latlng.lat.toFixed(6),lon:+e.latlng.lng.toFixed(6)}));document.getElementById("bCustom").textContent="Click the map…"};
 renderList()}
[fRun,fStat,fDec].forEach(f=>f.onchange=renderList);
fRun.addEventListener("change",()=>{layer.clearLayers();if(fRun.value)showRoutes(fRun.value,["AM","PM"],true);else routeLayer.clearLayers()});
document.getElementById("export").onclick=()=>{const out=DATA.filter(d=>dec[id(d)]).map(d=>({run:d.run,trip:d.trip,seq:d.seq,text:d.text,...dec[id(d)]}));
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:"application/json"}));a.download="qa-decisions.json";a.click()};
renderList();
</script></body></html>'''


def main(matches, raw_dir, out, segments=None):
    data = json.loads(Path(matches).read_text())
    raw = {p.stem: json.loads(p.read_text()) for p in Path(raw_dir).glob("*.json")}
    for d in data:
        trip = next(t for t in raw[d["run"]]["trips"] if t["label"] == d["trip"])
        items = trip["items"]
        d["context"] = [{"time": items[k].get("time"), "line": ((items[k].get("turn", "") + " ") + items[k]["text"]).strip(), "cur": k == d["seq"]}
                        for k in range(max(0, d["seq"] - 2), min(len(items), d["seq"] + 3))]
    if segments:
        for g in json.loads(Path(segments).read_text()):
            items = next(t for t in raw[g["run"]]["trips"] if t["label"] == g["trip"])["items"]
            data.append({"seg": True, "run": g["run"], "trip": g["trip"], "seq": g["seq"], "time": None,
                         "text": "As required: " + (g["road"] or "(after a named stop)"), "status": g["status"], "candidates": [dict(c, score="") for c in g["stops"]],
                         "context": [{"time": items[k].get("time"), "line": ((items[k].get("turn", "") + " ") + items[k]["text"]).strip(), "cur": k == g["seq"]}
                                     for k in range(max(0, g["seq"] - 3), min(len(items), g["seq"] + 2))]})
    Path(out).write_text(TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")))
    print(f"wrote {out} with {len(data)} stops")


if __name__ == "__main__":
    main(*sys.argv[1:5])

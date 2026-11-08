#!/usr/bin/env python3
"""Match named stops in data/raw/*.json to TransLink GTFS stops (stops.txt).

usage: python3 -I scripts/match_stops.py <stops.txt> <raw_dir> <out.json>

Only items flagged "stop" are matched. Result per item: status strong|possible|none plus up to 3 candidates.
Matches are suggestions for the QA map, never final coordinates.
"""
import csv, json, re, sys
from pathlib import Path

ABBR = {"rd": "road", "st": "street", "dr": "drive", "ave": "avenue", "av": "avenue", "bvd": "boulevard", "blvd": "boulevard",
        "tce": "terrace", "pde": "parade", "cres": "crescent", "cl": "close", "ct": "court", "hwy": "highway", "pl": "place",
        "ln": "lane", "cct": "circuit", "mt": "mount", "mtn": "mountain", "sch": "school", "stn": "station", "pk": "park",
        "mwy": "motorway", "rly": "railway", "opp": "opposite", "cnr": "corner", "ss": "state", "sts": "streets"}
DROP = {"bs", "bus", "stop", "near", "at", "opposite", "corner", "the", "of", "and", "on", "before", "after", "just", "prior", "to", "shops"}


def toks(s):
    s = re.sub(r"\(.*?\)", " ", s.lower())
    out = []
    for w in re.findall(r"[a-z0-9']+", s):
        w = ABBR.get(w, w)
        if w not in DROP:
            out.append(w)
    return out


def load_stops(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [{"id": r["stop_id"], "name": r["stop_name"], "lat": float(r["stop_lat"]), "lon": float(r["stop_lon"]),
                 "toks": set(toks(r["stop_name"])), "nums": set(re.findall(r"\d+", r["stop_name"]))}
                for r in csv.DictReader(f) if r["location_type"] in ("0", "")]


def main(stops_path, raw_dir, out):
    stops = load_stops(stops_path)
    index = {}
    for s in stops:
        for t in s["toks"]:
            index.setdefault(t, []).append(s)
    results, tally = [], {"strong": 0, "possible": 0, "none": 0}
    for f in sorted(Path(raw_dir).glob("*.json")):
        run = json.loads(f.read_text())
        for trip in run["trips"]:
            for i, it in enumerate(trip["items"]):
                if not it.get("stop"):
                    continue
                q = toks(it["text"])
                words = [w for w in q if not w.isdigit()]
                nums = {w for w in q if w.isdigit()}
                if not words:
                    status, cands = "none", []
                else:
                    pool = {}
                    rare = min(words, key=lambda w: len(index.get(w, [None] * 10**6)))
                    for s in index.get(rare, []):
                        hit = sum(w in s["toks"] for w in words) / len(words)
                        if nums and nums & s["nums"]:
                            hit += 0.1
                        pool[s["id"]] = (hit, s)
                    ranked = sorted(pool.values(), key=lambda x: -x[0])[:3]
                    cands = [{"stop_id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"], "score": round(h, 2)} for h, s in ranked]
                    best = ranked[0][0] if ranked else 0
                    status = "strong" if best >= 1 else "possible" if best >= 0.6 else "none"
                tally[status] += 1
                results.append({"run": f.stem, "trip": trip["label"], "seq": i, "time": it.get("time"), "text": it["text"], "status": status, "candidates": cands})
    Path(out).write_text(json.dumps(results, indent=1, ensure_ascii=False))
    print(tally, "of", len(results))


if __name__ == "__main__":
    main(*sys.argv[1:4])

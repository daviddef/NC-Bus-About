#!/usr/bin/env python3
"""For each "as required" road segment, list the TransLink stops on that road near the run.

usage: python3 -I scripts/match_segments.py <stops.txt> <raw_dir> <stop_matches.json> <out.json>

Road = the item just before the "as required" note (leading "Continue [as]" removed).
Corridor = box around the nearest strong-matched named stops before/after it on the same trip;
if the trip has none, a box around all strong-matched stops of the run (both trips).
Candidates are stops whose name contains every word of the road name. Suggestions for review.
"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from match_stops import toks, load_stops  # noqa: E402

PAD_NEAR, PAD_RUN = 0.02, 0.03  # degrees (~2 km, ~3 km)


def road_of(items, i):
    j = i - 1
    while j >= 0 and items[j].get("as_required"):
        j -= 1
    if j < 0:
        return None, None
    it = items[j]
    if it.get("stop") or it.get("school_or_depot") or it.get("connection"):
        return None, j
    t = re.sub(r"^(continues?( as)?|follow(s)?( right)?( as)?)\s+", "", it["text"].strip(), flags=re.I)
    return t, j


def main(stops_path, raw_dir, matches_path, out):
    stops = load_stops(stops_path)
    strong = {}
    for m in json.loads(Path(matches_path).read_text()):
        if m["status"] == "strong" and m["candidates"]:
            c = m["candidates"][0]
            strong.setdefault((m["run"], m["trip"]), []).append((m["seq"], c["lat"], c["lon"]))
    res, tally = [], {"found": 0, "ambiguous": 0, "no_stops": 0, "no_road": 0}
    for f in sorted(Path(raw_dir).glob("*.json")):
        run = json.loads(f.read_text())
        run_pts = [p for t in run["trips"] for p in strong.get((f.stem, t["label"]), [])]
        for trip in run["trips"]:
            items, anchors = trip["items"], strong.get((f.stem, trip["label"]), [])
            for i, it in enumerate(items):
                if not it.get("as_required"):
                    continue
                road, _ = road_of(items, i)
                rec = {"run": f.stem, "trip": trip["label"], "seq": i, "road": road, "stops": []}
                parts = [[w for w in toks(x) if not w.isdigit()] for x in re.split(r"\s+continues?\s+as\s+|/|\s+then\s+", road or "")]
                parts = [w for w in parts if w]
                if not parts:
                    rec["status"] = "no_road"
                else:
                    before, after = [a for a in anchors if a[0] < i][-1:], [a for a in anchors if a[0] > i][:1]
                    prev = before + after if before and after else []  # two-sided only; else use the run's box
                    if prev:
                        pts, pad = prev, PAD_NEAR
                    else:
                        pts, pad = run_pts, PAD_RUN
                    if not pts:
                        rec["status"] = "no_stops"
                    else:
                        la, lo = [p[1] for p in pts], [p[2] for p in pts]
                        box = (min(la) - pad, max(la) + pad, min(lo) - pad, max(lo) + pad)
                        cand = [s for s in stops if any(set(w) <= s["toks"] for w in parts) and box[0] <= s["lat"] <= box[1] and box[2] <= s["lon"] <= box[3]]
                        rec["stops"] = [{"stop_id": s["id"], "name": s["name"], "lat": s["lat"], "lon": s["lon"]} for s in cand]
                        if not cand:
                            rec["status"] = "no_stops"
                        else:
                            span = (max(s["lat"] for s in cand) - min(s["lat"] for s in cand)) + (max(s["lon"] for s in cand) - min(s["lon"] for s in cand))
                            rec["status"] = "ambiguous" if (span > 0.1 or (not prev and len(cand) > 25)) else "found"
                            rec["anchored"] = bool(prev)
                tally[rec["status"]] += 1
                res.append(rec)
    Path(out).write_text(json.dumps(res, indent=1, ensure_ascii=False))
    print(tally, "of", len(res), "| stops listed:", sum(len(r["stops"]) for r in res))


if __name__ == "__main__":
    main(*sys.argv[1:5])

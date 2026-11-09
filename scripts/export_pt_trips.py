#!/usr/bin/env python3
"""Trips for the in-browser public transport planner: every service running in the afternoon around Brisbane.

usage: python3 -I scripts/export_pt_trips.py <unzipped_gtfs_dir> <out.json> [service_date YYYYMMDD]

Keeps stop_times between 15:00 and 19:30 at stops inside the box below, on one normal school-term weekday.
Source: TransLink open data, CC BY 4.0. Times are delta-coded minutes (seconds dropped) to keep the file small.
"""
import csv, json, sys, datetime, collections
from pathlib import Path

BOX = (-27.60, -27.17, 152.82, 153.22)  # lat_min, lat_max, lon_min, lon_max
T0, T1 = 15 * 60, 19 * 60 + 30


def rd(d, f):
    return csv.DictReader(open(Path(d) / f, encoding="utf-8-sig"))


def main():
    gtfs, out = sys.argv[1], sys.argv[2]
    ds = sys.argv[3] if len(sys.argv) > 3 else "20261117"
    day = datetime.datetime.strptime(ds, "%Y%m%d").strftime("%A").lower()
    stops = {}
    for r in rd(gtfs, "stops.txt"):
        if r.get("location_type", "") not in ("", "0"):
            continue
        try:
            la, lo = float(r["stop_lat"]), float(r["stop_lon"])
        except ValueError:
            continue
        if BOX[0] <= la <= BOX[1] and BOX[2] <= lo <= BOX[3]:
            stops[r["stop_id"]] = (la, lo, r["stop_name"])
    active = {r["service_id"] for r in rd(gtfs, "calendar.txt") if r["start_date"] <= ds <= r["end_date"] and r[day] == "1"}
    for r in rd(gtfs, "calendar_dates.txt"):
        if r["date"] == ds:
            (active.add if r["exception_type"] == "1" else active.discard)(r["service_id"])
    trips = {r["trip_id"]: (r["route_id"], r.get("trip_headsign", "")) for r in rd(gtfs, "trips.txt") if r["service_id"] in active}
    routes = {r["route_id"]: (r["route_short_name"], r["route_type"]) for r in rd(gtfs, "routes.txt")}
    seqs = collections.defaultdict(list)
    for r in rd(gtfs, "stop_times.txt"):
        s = r["stop_id"]
        if s not in stops or r["trip_id"] not in trips:
            continue
        a, d = r["arrival_time"], r["departure_time"]
        ma, md = int(a[:2]) * 60 + int(a[3:5]), int(d[:2]) * 60 + int(d[3:5])
        if T0 <= md <= T1 or T0 <= ma <= T1:
            seqs[r["trip_id"]].append((int(r["stop_sequence"]), s, ma, md))
    sidx, slist = {}, []
    ridx, rlist = {}, []
    tl = []
    for tid, lst in seqs.items():
        if len(lst) < 2:
            continue
        lst.sort()
        rt, hs = trips[tid]
        if rt not in ridx:
            ridx[rt] = len(rlist); rlist.append([routes[rt][0], routes[rt][1]])
        for _, s, _, _ in lst:
            if s not in sidx:
                sidx[s] = len(slist); slist.append([stops[s][2], round(stops[s][0], 5), round(stops[s][1], 5)])
        t0 = lst[0][2]
        # [route, headsign, first-arrival, stop indices, arrival offsets, departure offsets]
        tl.append([ridx[rt], hs, t0, [sidx[s] for _, s, _, _ in lst], [a - t0 for _, _, a, _ in lst], [d - t0 for _, _, _, d in lst]])
    tl.sort(key=lambda t: t[2])
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"date": ds, "stops": slist, "routes": rlist, "trips": tl}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out}: {len(tl)} trips, {len(slist)} stops, {Path(out).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

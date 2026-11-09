#!/usr/bin/env python3
"""Cut TransLink's SEQ GTFS down to the public transport around Nudgee, for the map overlay.

usage: python3 -I scripts/export_pt_overlay.py <unzipped_gtfs_dir> <out.json> [service_date YYYYMMDD] [radius_km]

Keeps stops within the radius, the route lines through that area, and each stop's weekday-afternoon
(14:30-18:00) departures on a normal school-term weekday. Source: TransLink open data, CC BY 4.0.
"""
import csv, json, math, sys, collections, datetime
from pathlib import Path

SCHOOL = (-27.3595, 153.0640)
WIN = (14 * 60 + 30, 18 * 60)


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))


def rd(d, f):
    return csv.DictReader(open(Path(d) / f, encoding="utf-8-sig"))


def simplify(pts, tol):
    """Ramer-Douglas-Peucker on lat/lon (tol in metres, flat-earth approximation)."""
    if len(pts) < 3:
        return pts
    k = 111320.0
    cl = math.cos(SCHOOL[0] * math.pi / 180)
    xy = [(p[1] * k * cl, p[0] * k) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = xy[a]; bx, by = xy[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs(dy * (xy[i][0] - ax) - dx * (xy[i][1] - ay)) / n
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k2 in zip(pts, keep) if k2]


def main():
    gtfs, out = sys.argv[1], sys.argv[2]
    ds = sys.argv[3] if len(sys.argv) > 3 else "20261117"
    radius = float(sys.argv[4]) * 1000 if len(sys.argv) > 4 else 6000
    day = datetime.datetime.strptime(ds, "%Y%m%d").strftime("%A").lower()

    stops = {}
    for r in rd(gtfs, "stops.txt"):
        if r.get("location_type", "") not in ("", "0"):
            continue
        try:
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        except ValueError:
            continue
        if hav(SCHOOL[0], SCHOOL[1], lat, lon) <= radius:
            stops[r["stop_id"]] = (lat, lon, r["stop_name"])

    active = {r["service_id"] for r in rd(gtfs, "calendar.txt") if r["start_date"] <= ds <= r["end_date"] and r[day] == "1"}
    for r in rd(gtfs, "calendar_dates.txt"):
        if r["date"] == ds:
            (active.add if r["exception_type"] == "1" else active.discard)(r["service_id"])

    trips = {r["trip_id"]: (r["route_id"], r.get("trip_headsign", ""), r.get("shape_id", "")) for r in rd(gtfs, "trips.txt") if r["service_id"] in active}
    routes = {r["route_id"]: (r["route_short_name"], r["route_type"]) for r in rd(gtfs, "routes.txt")}

    deps = collections.defaultdict(list)          # (stop, route, headsign) -> minutes
    shape_use = collections.Counter()              # (route, shape) -> trips through the area
    seen_trip = set()
    for r in rd(gtfs, "stop_times.txt"):
        s = r["stop_id"]
        t = trips.get(r["trip_id"])
        if s not in stops or t is None:
            continue
        if r["trip_id"] not in seen_trip:
            seen_trip.add(r["trip_id"])
            shape_use[(t[0], t[2])] += 1
        h = r["departure_time"]
        m = int(h[:2]) * 60 + int(h[3:5])
        if WIN[0] <= m <= WIN[1]:
            deps[(s, t[0], t[1])].append(m)

    # Stops are kept if anything runs there this afternoon.
    by_stop = collections.defaultdict(list)
    for (s, rt, hs), ms in deps.items():
        by_stop[s].append([routes[rt][0], hs, sorted(ms)])
    out_stops = []
    for s, lines in by_stop.items():
        lat, lon, name = stops[s]
        kinds = {routes[rt][1] for (st, rt, _h) in deps if st == s}
        out_stops.append({"id": s, "n": name, "p": [round(lat, 5), round(lon, 5)], "m": sorted(kinds)[0], "l": sorted(lines)})

    # One line per route through the area: its most-used shape(s), clipped to the area and simplified.
    # the two most-used shapes per route
    per = collections.defaultdict(list)
    for (rt, sh), n in shape_use.items():
        if sh:
            per[rt].append((n, sh))
    want = {sh: rt for rt, lst in per.items() for n, sh in sorted(lst, reverse=True)[:2]}
    pts = collections.defaultdict(list)
    for r in rd(gtfs, "shapes.txt"):
        if r["shape_id"] in want:
            pts[r["shape_id"]].append((int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
    lines = collections.defaultdict(list)
    for sh, lst in pts.items():
        lst.sort()
        run, runs = [], []
        for _, la, lo in lst:
            if hav(SCHOOL[0], SCHOOL[1], la, lo) <= radius * 1.15:
                run.append([round(la, 5), round(lo, 5)])
            elif run:
                runs.append(run); run = []
        if run:
            runs.append(run)
        for seg in runs:
            seg = simplify(seg, 12)
            if len(seg) > 1:
                lines[want[sh]].append(seg)
    payload = {
        "date": ds, "radiusKm": radius / 1000, "window": "14:30-18:00 weekday",
        "routes": [{"id": routes[rt][0], "m": routes[rt][1], "g": g} for rt, g in sorted(lines.items(), key=lambda kv: routes[kv[0]][0])],
        "stops": sorted(out_stops, key=lambda x: x["id"]),
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out}: {len(payload['routes'])} route lines, {len(out_stops)} stops, {Path(out).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

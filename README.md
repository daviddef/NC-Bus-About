# NC Bus: St Joseph's Nudgee College bus guide (prototype)

A student-first way to answer "which bus do I catch, where do I get off, and when do I get home?"
Independent prototype. Not an official College or BusMinder product, and **not yet checked by College Transport**.
BusMinder stays the source of truth for live tracking, payments and tap-on/off.

## What is here

| Folder | What |
|---|---|
| `app/` | The React planner (Vite + TypeScript + Leaflet). Type a place, compare runs side by side. See `app/README.md`. |
| `scripts/` | Python pipeline: read the College run-sheet PDFs, match stops to TransLink stops, build the app's data. |
| `data/` | Pipeline output: `raw/` (parsed run sheets), `stop_matches.json`, `segment_stops.json`, `osrm_cache.json`. |
| `qa/` | Static stop-checking tool and the first single-file planner prototype (`index.html`, `planner.html`). |
| `PROPOSAL.md` | Architecture, data model, user flows, questions for College Transport, and findings from the PDFs. |

## What the data really is

- The College PDFs are **driver turn-by-turn run sheets**, not passenger stop lists: mostly road names, a few named stops, and "pick up / drop as required" on roads.
- The afternoon sheets give **one time** (the departure from school). All other times in the planner are **estimates**: each run is driven once with OSRM through its matched stops and the bus is assumed 30% slower than a car.
- Stop coordinates come from TransLink's open SEQ GTFS feed, matched by name. **Matches are suggestions until checked** in `qa/index.html`.
- Route lines are approximate drives between matched stops, not the College's real route.
- Some sheets are old (Runs 3, 6, 10 and 15 are dated 2021). Runs 5 and the Rail Bus have too few matched stops to be planned yet.

## Rebuild the data

```bash
# 1. PDFs (download from https://www.nudgee.com/bus-runs into a folder) -> data/raw/*.json
python3 -I scripts/extract_runs.py <pdf_dir> data/raw
# 2. Match to TransLink stops (stops.txt from https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip)
python3 -I scripts/match_stops.py <stops.txt> data/raw data/stop_matches.json
python3 -I scripts/match_segments.py <stops.txt> data/raw data/stop_matches.json data/segment_stops.json
# 3. Data file for the app (routes the first time via public OSRM, then cached)
python3 -I scripts/export_app_data.py data/stop_matches.json data/segment_stops.json data/raw app/public/data/planner-data.json data/osrm_cache.json
# Optional: the QA tool
python3 -I scripts/build_qa.py data/stop_matches.json data/raw qa/index.html data/segment_stops.json
```

The College PDFs and the TransLink download are not stored in this repo.

## Before real use

Needs answers from College Transport: an official BusMinder data feed or permission, the stop export with coordinates, what "as required" means in practice, and which run sheets are current.
See section 6 of `PROPOSAL.md`.

#!/usr/bin/env python3
"""Write the React planner's data file (runs, stops, estimated route geometry).

usage: python3 -I scripts/export_app_data.py <stop_matches.json> <segment_stops.json> <raw_dir> <out.json> [osrm_cache.json]
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_planner import build_runs  # noqa: E402

if __name__ == "__main__":
    matches, segments, raw_dir, out = sys.argv[1:5]
    runs = build_runs(matches, segments, raw_dir, *(sys.argv[5:6] or []))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"school": [-27.3387, 153.0716], "runs": runs}, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {out}: {len(runs)} runs, {Path(out).stat().st_size // 1024} KB")

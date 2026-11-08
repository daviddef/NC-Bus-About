# Which bus home? (planner app)

React + TypeScript + Vite + Leaflet. Type a place or address and see which afternoon school bus gets you closest or home soonest,
with a side-by-side comparison of the runs you tick.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

Data: `public/data/planner-data.json`, produced from the College run sheets by `../scripts/export_app_data.py`.
Times and route lines are **estimates** (see the root README). The prototype has not been checked by College Transport.

# Nudgee Bus Guide — Proposal

Status: draft for discussion. Nothing here has been checked against the College PDFs or the BusMinder map yet; section 4 and the questions in section 6 exist because of that.

## 1. Recommendation in one paragraph

Build a **static-first Progressive Web App**: no server, no accounts. All run data ships as versioned JSON/GeoJSON files, all matching ("nearest stop", "best run") runs on the phone, and the student's saved home address never leaves the device. BusMinder stays the system of record for live tracking, payments and tap-on/off; the app links out to it. This makes the MVP cheap to host, works offline, avoids holding any student data, and is easy for the College to adopt or take over.

## 2. Tech stack and architecture

| Layer | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript (SvelteKit is an equal alternative) | Mobile web first; installable PWA; one codebase for iOS and Android |
| Map | MapLibre GL JS + vector tiles | Free, offline-capable, styleable in school blue/white |
| Tiles | Protomaps PMTiles extract of north Brisbane / Moreton Bay region, hosted as one static file | Offline caching in the service worker; no per-view tile fees |
| Offline | Service worker (Workbox): precache app shell, run JSON, tile extract | Stop lists and basic maps work at the bus bay with no signal |
| Local state | `localStorage` / IndexedDB: home, usual runs | No backend, no personal data stored server-side |
| Geocoding (address → lat/lng) | Hosted geocoder with a proper licence (e.g. MapTiler, Geoscape, or Google Places); suburb-only search works from a bundled suburb list with no API at all | Public Nominatim forbids app-scale use. Offering "suburb or street" first reduces how many addresses are ever sent out |
| Walking distance | MVP: straight line × 1.3, labelled "about". Phase 2: precomputed foot-routing (Valhalla/OSRM) from each stop to a grid or to searched points | Avoids a routing server in the MVP |
| Hosting | Cloudflare Pages (static) | Free tier is enough; fast in AU |
| Build pipeline | Repo holds the source of truth (`data/runs/*.yaml` + `stops.geojson`); a build step validates and emits `runs.v2026.json`, `stops.geojson`, `shapes.geojson` | Every data change is a reviewable diff; schema checks catch missing coordinates or out-of-order times |
| Live bus position | Not built. Deep link to the official BusMinder map and parent app. Embed or API only if the College grants it (question Q1) | Out of scope per brief, and it is the College's data |

**Data flow**

```
PDFs + BusMinder map  ->  extraction  ->  stops.csv  ->  match to TransLink stops / geocode
        ->  human verify (QA map)  ->  YAML/GeoJSON in repo  ->  build  ->  static JSON  ->  PWA
```

**Where the logic lives:** a small pure-TypeScript `engine` module (nearest stops, run ranking, alight-stop choice, walk estimate) with unit tests built from real examples ("boy lives at X, should catch Run N"). Because it is pure, it can later move to a server or native app unchanged.

**Native vs PWA:** go PWA. Year 5+ students and parents will open a link or a QR code on a bus bay poster; no app-store review, and updates are instant when the term timetable changes. Revisit native only if the College wants push notifications (BusMinder already does these).

## 3. Data model

Key idea: a **Stop is a place**, shared by many runs; a **Visit** is a run calling at a stop at a time on a trip. AM and PM are separate trips and must not be assumed to be mirror images.

```ts
type Run = {
  id: string                // "run-05-samford"
  number: string            // "5", "2a", "2b", "rail", "sports-5pm", "boarders-ssc"
  name: string              // "Samford"
  colour?: string
  validFrom: string         // term/year the timetable applies to
  validTo: string
  pdfUrl: string            // source document, for "check the official list"
  notes?: string
}

type Trip = {
  id: string                // "run-05-am", "run-05-pm"
  runId: string
  direction: "to_school" | "from_school"
  days: ("Mon"|"Tue"|"Wed"|"Thu"|"Fri")[]
  shapeId?: string          // polyline in shapes.geojson
  visits: Visit[]           // ordered
}

type Visit = {
  seq: number
  stopId: string
  time?: string             // "07:12" if the PDF gives one
  windowMin?: [string, string]   // or an earliest/latest window
  mode: "scheduled" | "as_required"   // "pick up / drop as required"
  setDownOnly?: boolean
  pickUpOnly?: boolean
  note?: string
}

type Stop = {
  id: string
  name: string              // as printed in the PDF
  lat: number
  lng: number
  translinkStopId?: string  // Council/TransLink stop where one exists
  coordSource: "translink" | "geocoded" | "busminder_map" | "surveyed" | "college_supplied"
  coordConfidence: "verified" | "likely" | "approx"   // drives UI wording
  suburb: string
}

type Place = { id: string; label: string; lat: number; lng: number; kind: "suburb"|"landmark"|"school" }  // bundled search targets

type Notice = { id: string; runIds: string[]; text: string; from: string; to?: string }  // e.g. "Run 9 detour this week"
```

Notes:
- `coordConfidence` is shown to the user: "approx" renders as "stop near Smith St" with a looser circle, never a precise pin implying the bus stops exactly there.
- Run-level and visit-level `validFrom` let 2026 and 2027 data coexist in the cache.
- Nothing about students, families or individual addresses appears anywhere in the data.

### Matching rules (in the engine)

**Home → school (AM).** For every AM trip, take the visit nearest to home (by walking estimate). Rank trips by: (1) walk to the stop, (2) whether the stop is `scheduled` rather than `as_required`, (3) boarding time relative to the school start. Show the top 3 with "walk 6 min to Smith St, bus at about 7:12". If the best walk is over a threshold (suggest 15 min), say so and suggest the nearest run with "ask a parent to drop you at X".

**School → destination (PM).** For every PM trip, take every visit with `pickUpOnly` false, find the one nearest the destination, and compute the remaining walk. Rank by remaining distance, then by departure time and number of stops. Recommend the alight stop by name. If the remaining distance exceeds the walk threshold, show a **"part-way only"** banner: "This bus gets you within 1.4 km. Walk about 18 min, or arrange a pick-up at [stop]."

## 4. Obtaining and digitising stop coordinates

Ordered by preference; stop at the first that works.

1. **Ask the College** for the BusMinder stop export (or whatever transport staff built the PDFs from). Most accurate, fully permitted, and reduces work to a few days. (Q2)
2. **Match printed stop names to TransLink's open GTFS stops** (Queensland open data, CC-BY). Many Council stops on school runs are normal TransLink stops, so a fuzzy match on street + suburb gives an exact coordinate and stop ID with no guessing.
3. **Geocode the remainder** from the printed text ("cnr X St and Y Rd" geocodes well as an intersection), then flag `likely`.
4. **Cross-check visually** on an internal QA page: every stop plotted on the map with the PDF row beside it, click to accept or drag to correct. Two people check each run. This is the step that turns `likely` into `verified`.
5. **Polylines:** snap consecutive stops to the road network with a map-matching/routing engine (Valhalla or OSRM, run once at build time), then eyeball every run on the QA page. If the College supplies BusMinder route geometry, use that instead.
6. **BusMinder's public map as a reference only.** I would use it to eyeball results. I would **not** scrape its network calls to extract data without the College's agreement (Q1/Q2), since it is their system and the terms are unknown.

PDF extraction: try `pdfplumber`/`pdftotext` first. If the PDFs are scanned images, OCR with a human proofread. Either way the extracted table is reviewed, not trusted.

Estimate: about 15 runs, perhaps 20 to 40 stops each, so a few hundred stops. Manual verification is a day or two once the extraction works.

## 5. User flows (wireframe level)

Design rules: 48 px touch targets, one question per screen, big type, plain words ("Walk 6 min", not "pedestrian egress"), blue (#0b3d91-ish, to be matched to the College brand) and white. First-time visitors can answer without signing in.

### Flow A: Home → school ("Which bus do I catch?")

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ Nudgee Bus Guide      ⓘ  │   │ ←  Buses near you        │   │ ←  Run 5 · Samford       │
│                          │   │                          │   │ [map: route + your stop] │
│ Where do you live?       │   │ ★ Best match             │   │                          │
│ ┌──────────────────────┐ │   │ ┌──────────────────────┐ │   │ Your stop                │
│ │ 🔍 Suburb or street  │ │   │ │ Run 5 Samford        │ │   │ Smith St (7:12 am)       │
│ └──────────────────────┘ │   │ │ Smith St · walk 6min │ │   │ Walk 6 min from home     │
│  [ Use my location ]     │   │ │ about 7:12 am        │ │   │                          │
│                          │   │ └──────────────────────┘ │   │ All stops (list)         │
│ ─ or ─                   │   │ Also possible            │   │ 7:05 Dayboro Rd          │
│ My saved home: Samford ▸ │   │ Run 4 The Gap · 14 min   │   │ 7:12 Smith St  ◀ you     │
│                          │   │ ⚠ Run 8 · as-required    │   │ 7:20 ...                 │
│ [ Where do I get off? ]  │   │                          │   │                          │
│ (afternoon)              │   │ [ Save as my home ]      │   │ [Open live map ↗] [Save] │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

Goal: under 60 seconds from first load to "Run 5, Smith St, 7:12". "As required" stops carry a clear label: "Bus stops here only if booked / asked for" (wording to be confirmed with the College).

### Flow B: School → destination ("Which bus gets me closest?")

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ Where are you going?     │   │ ←  Best afternoon buses  │   │ ←  Run 12 · Everton Park │
│ ┌──────────────────────┐ │   │ ★ Run 12 Everton Park    │   │ [map: bus route, ⬤ alight│
│ │ 🔍 Place or street   │ │   │   Get off: Lamington St  │   │   stop, dashed walk line]│
│ └──────────────────────┘ │   │   Walk 4 min (350 m)     │   │                          │
│ Quick picks: Home · Gran │   │   Departs 3:20 pm        │   │ Get off at               │
│ · Train station · Mall   │   │ ─────────────────────    │   │ Lamington St             │
│                          │   │ Run 13 Wavell Heights    │   │ then walk about 4 min    │
│                          │   │   Gets you part-way      │   │                          │
│                          │   │   ⚠ 1.4 km to walk       │   │ ⚠ Part-way only banner   │
│                          │   │                          │   │   (when > threshold)     │
│                          │   │                          │   │ [Open live map ↗]        │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

"Part-way only" is a distinct, high-contrast state with two next actions: *Ask someone to pick me up at [stop]* (share-sheet text with stop name and time) and *Show walking map*.

### Other screens
- **All runs:** list of all runs with colour dots; tap for the stop list and route. Doubles as the offline fallback.
- **My buses:** saved home plus "usual runs" with next-departure display.
- **Official links:** BusMinder live map, BusMinder parent app, College transport page, and a "Report a wrong stop" link to transport@nudgee.qld.edu.au.
- **Offline banner** when data is cached but no connection, plus a "Timetable last updated: [date]" line everywhere.

## 6. Questions for College Transport (before development starts)

**Data and permission**
1. Is there an official BusMinder API, data feed, or permission to embed the live map (`maps.busminder.com.au/route/live/...`) in a College-endorsed app? Does BusMinder's licence allow this?
2. Can the College supply the underlying stop list with coordinates and times (the source the PDFs were made from), in CSV/Excel/KML?
3. Who owns and updates the data each term? Can we get a change notice (email or a shared sheet) when a run changes, and how quickly do changes happen mid-term?
4. May we reproduce the PDF content (stop names, times) in the app, and use the College name, crest and colours? Is this an official College app, or an independent one with a disclaimer?

**What the data means**
5. What exactly does "pick up / drop as required" mean in practice: any Council stop on that segment, only pre-notified stops, driver's discretion? How should a student ask for it?
6. Are AM and PM routes the same stops in reverse, or different? Are PM times fixed, and is there a published departure time from the bays?
7. Which runs operate on which days (sports days, the 5 pm Sports Bus, the Rail Bus, Boarders Sunshine Coast), and are there holiday, exam or event variants?
8. Are the times in the PDFs scheduled times or approximate guides? How should we word reliability ("about 7:12")?
9. Can students alight at any stop on a run in the afternoon, or only at listed stops? Can a student ride a different run than their registered one on a given day?
10. Is there a maximum acceptable walk or a rule of thumb the College uses for "part-way" (suggest 1 km or 15 min)? What do they want to say to parents in that case?

**Safety, privacy, governance**
11. Any concerns about showing exact stop locations publicly? (They are on Council stops and in public PDFs, so probably fine, but worth asking.)
12. Do you want the app hosted on a nudgee.com domain or the College's own account, and who is the long-term owner/maintainer?
13. Does the College want usage analytics (e.g. page views only, no personal data), and what is its policy for anything collecting location?
14. Who can sign off wording for students (Year 5+) and parents, and who tests it (a few families, bus monitors)?

## 7. Phasing

| Phase | Scope | Exit check |
|---|---|---|
| 0 | Answers to Q1 to Q4; PDFs and stop export in hand | Permission to proceed |
| 1 | Extraction pipeline, stop matching, QA tool; all runs verified | Every stop `verified` or consciously `approx` |
| 2 | MVP app: Flow A, Flow B, saved home, route map, part-way banner, deep links, offline | A new family finds their run in under 60 s in a test |
| 3 | Pilot with bus captains/Year 7 families; fix wording and edge cases | Fewer "which bus?" questions at the bays |
| 4 | Optional: live position (if allowed), foot routing, notices, 2027 timetable import | Based on pilot feedback |

## 8. Main risks

- **Stale or wrong data** harms trust and could put a child on the wrong bus. Mitigation: "last updated" date on every screen, a visible "check the official list" link, and a one-tap error report.
- **Over-precise pins** for "as required" stops. Mitigation: confidence tiers and cautious wording.
- **Location privacy.** Mitigation: home saved on device only; address search sent to a geocoder only when typed, with suburb search needing no external call.
- **Unauthorised use of BusMinder data.** Mitigation: ask first; link out until permission is explicit.
- **Annual upkeep.** Mitigation: data lives in a plain, reviewable format, with the importer scripted so a new timetable is a few hours' work.

## 9. Findings from the 19 College PDFs (checked 2026-11-08)

All 19 PDFs from nudgee.com/bus-runs downloaded and text-extracted (they have a text layer, so no OCR is needed). Source URLs are on the bus-runs page.

**What they are:** driver turn-by-turn run sheets ("Left Sandgate Road", "U turn into bus bays"), not passenger stop lists. Each is a two-column page, AM then PM, with times at only some points. This changes parts of section 3 and 4:

1. **Few stops, mostly roads.** Named stops are sparse (e.g. Run 5: Mary Ring Drive, Mayflower Street, Graham Rd near Stirling St, Ridley Rd at Ridley Road South). Most of each run is a sequence of roads.
2. **"As required" is a road segment, not a stop.** Run 8 says: "Pick up as required - bus will pick up from Council Bus Stops along the route where safe to do so". In the PM, "Drop as required" appears under a road. So `Visit` needs a second kind: a **segment** (road or road span, `mode: as_required`) in addition to a **point stop**. For PM, the alight recommendation is "any Council stop on [road]", and the app should then use TransLink stop data to name the nearest actual stop. That makes the TransLink GTFS match (section 4, step 2) essential, not optional.
3. **Almost no PM times.** PM sheets give a departure (about 15:05; Run 5 says 14:45 supervisors call, 15:05 depart) and nothing after. The app can show a departure time and an order of roads, not arrival times. I'd drop "about 7:12"-style times for PM and say "leaves 3:05 pm".
4. **AM times are partial:** 6 to 17 timed lines per run, with times such as "7.35" or "7.44 Mayflower Street bus stop". Untimed stops need interpolation, shown as approximate.
5. **Mismatched AM and PM routes, confirmed.** Run 8 PM visits the same roads in reverse order but with no stops listed that match; Run 5 PM goes a different way (Ridley, Graham, Bridgeman) to its AM sequence. Keep separate AM and PM trips.
6. **Special instructions the model must carry:** "EXPRESS ALONG BEAMS ROAD - DO NOT STOP" (Run 5), connections to other school buses ("Connect with School Bus 77/78", "OFF LOAD Pax to School Bus No 59", Run 5), and "Do not depart until ALL connections are made". Add `Visit.mode = "express"` (no stops) and a `Connection` record. Students from Dayboro/Samsonvale transfer; the app should say so.
7. **Different shape for the special runs.** The Rail Bus is a shuttle (Nudgee, Boondall Station, with train times 8.12 Banyo and 8.17 Shorncliffe), the 5pm Sports Bus lists named stops and school bays on a loop, and the Boarders Run has only departure points and times (Nudgee 3.10, Aussie World, Darby Close Maroochydore; south 4.30). These need hand entry, not the generic importer.
8. **Data freshness varies widely.** "Updated" dates: Run 5 2022-04-14, Runs 6, 10, 15 and 3 2021-12-08, Boarders 2018, Runs 1, 4, 14 January 2026, Rail Bus 2026-02-05. Some are old enough that I'd treat them as unconfirmed until the College says they are current. The app must show "source updated" per run.
9. **Header text is useful:** every sheet says "Follow the BusMinder procedures for Nudgee students". Runs 4 and 14 filenames include "new-T1_2026", which suggests mid-year changes are normal.
10. **No days of operation** appear on the sheets. Only the Boarders run is described as weekly (Friday out, Sunday back) on the web page.

**Effect on the plan**
- Digitising effort is larger than I estimated: I'd treat the road sequence as the primary data and reconstruct the route geometry from it (map-matching the named roads), then attach the few named stops and time points to that line. Roughly 16 runs, each needing a road-sequence parse plus a human check.
- Coordinates for "any Council stop on this road" come from TransLink GTFS, so the QA tool should show candidate stops along each as-required segment.
- Part-way logic still works, but PM answers become "get off on Castle Hill Drive near Dohles Rocks Road", not "at stop X at 3:42".
- Questions Q5 and Q6 are now the critical ones. New Q: are the driver sheets the authoritative source, or does BusMinder hold a different, newer stop list? Which of the 2021 and 2022 sheets are still current?

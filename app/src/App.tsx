import { useEffect, useMemo, useState } from 'react'
import Comparison from './components/Comparison'
import MapView from './components/MapView'
import RunCard, { RunRow } from './components/RunCard'
import SearchBox from './components/SearchBox'
import { addRecent, loadRecents, saveRecents, type Place } from './lib/places'
import { mins } from './lib/format'
import { GREY, PALETTE, planTrips, prepare, sortResults, walkMinutes, withWalk } from './lib/plan'
import { dist } from './lib/geo'
import { walkingRoute, type Walk } from './lib/walking'
import type { Dataset, Priority, Pt, Result, Run } from './types'

const CATS: { pri: Priority; tag: string }[] = [
  { pri: 'quick', tag: 'Quickest' },
  { pri: 'stops', tag: 'Fewest stops' },
  { pri: 'walk', tag: 'Least walking' },
]

export default function App() {
  const [runs, setRuns] = useState<Run[]>([])
  const [school, setSchool] = useState<Pt>([-27.3595, 153.0640])
  const [loadErr, setLoadErr] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [recents, setRecents] = useState<Place[]>(() => loadRecents())
  const [selected, setSelected] = useState<string[]>([])
  const [view, setView] = useState<'map' | 'compare'>('map')
  const [fitKey, setFitKey] = useState(0)
  const [walks, setWalks] = useState<Record<string, Walk>>({})

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/planner-data.json')
      .then((r) => r.json() as Promise<Dataset>)
      .then((d) => { setRuns(prepare(d)); setSchool(d.school) })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])

  const dest: Pt | null = place ? [place.lat, place.lon] : null
  const baseA = useMemo(() => (dest ? planTrips(runs, dest, 'quick') : []), [runs, dest])
  const bases = useMemo(() => (dest ? Object.fromEntries(CATS.map((c) => [c.pri, planTrips(runs, dest, c.pri)])) as Record<Priority, Result[]> : null), [runs, dest])
  const wkey = (r: Result) => `${r.run.key}|${r.stop.lat},${r.stop.lon}|${dest?.join(',')}`

  // Real walking routes for the top results and for everything ticked (both stop choices).
  useEffect(() => {
    if (!dest) return
    let live = true
    const todo = [...baseA.slice(0, 8), ...(bases ? CATS.flatMap((c) => bases[c.pri].slice(0, 3)) : []), ...baseA.filter((r) => selected.includes(r.run.key))]
    todo.forEach((r) => {
      walkingRoute([r.stop.lat, r.stop.lon], dest).then((w) => { if (live && w) setWalks((p) => (p[wkey(r)] ? p : { ...p, [wkey(r)]: w })) })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseA, bases, selected])

  // Each ticked run gets its own colour, in the order ticked; the rest stay grey.
  const paint = (r: Result): Result => {
    const i = selected.indexOf(r.run.key)
    return { ...r, run: { ...r.run, colour: i >= 0 ? PALETTE[i % PALETTE.length] : GREY } }
  }
  const real = (r: Result) => (walks[wkey(r)] ? withWalk(r, walks[wkey(r)]) : r)
  const results = useMemo(() => sortResults(baseA.map(real), 'quick').map(paint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseA, walks, selected])
  // The best run for each of the three things that matter; one card if the same run wins more than one.
  const top = useMemo(() => {
    const out: { r: Result; tags: string[] }[] = []
    if (!bases) return out
    for (const c of CATS) {
      const list = bases[c.pri].map(real)
      const first = list[0]
      if (!first) continue
      const same = out.find((o) => o.r.run.key === first.run.key && o.r.stop.lat === first.stop.lat && o.r.stop.lon === first.stop.lon)
      if (same) { same.tags.push(c.tag); continue }
      if (!out.some((o) => o.r.run.key === first.run.key)) out.push({ r: first, tags: [c.tag] })
    }
    return out.map((o) => ({ ...o, r: paint(o.r) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, walks, selected])
  const topKeys = top.map((t) => t.r.run.key)
  const chosen = selected.map((k) => top.find((t) => t.r.run.key === k)?.r ?? results.find((r) => r.run.key === k)).filter((r): r is Result => !!r).map(paint)

  function pick(p: Place) {
    setPlace(p)
    if (p.icon !== 'target') setRecents((r) => addRecent(r, p)) // never remember where someone actually is
    setSelected([...new Set(CATS.map((c) => planTrips(runs, [p.lat, p.lon], c.pri)[0]?.run.key).filter(Boolean))] as string[])
    setView('map'); setFitKey((k) => k + 1)
  }

  function toggle(key: string) {
    const on = selected.includes(key)
    setSelected(on ? selected.filter((k) => k !== key) : [...selected, key])
    if (!on) setFitKey((k) => k + 1)
  }

  const walkAll = dest ? walkMinutes(dist(school, dest)) : null
  const rest = results.filter((r) => !topKeys.includes(r.run.key)).slice(0, 10)

  return (
    <div className="app">
      <section className="head">
        <header>
          <h1>Which bus home?</h1>
          <p>From St Joseph&rsquo;s Nudgee College &middot; prototype with estimated times</p>
        </header>
        <SearchBox ready={runs.length > 0} recents={recents} onPick={pick} onClearRecents={() => { setRecents([]); saveRecents([]) }} />
        {loadErr && <p className="err pad">Could not load run data: {loadErr}</p>}
      </section>

      <section className="top">
        {!dest && (
          <p className="note">Type where you are going. Times are estimates worked out from road distance — the College sheets only give the 3:05 pm departure. Not yet checked by College Transport: always check BusMinder and your driver.</p>
        )}
        {place && <p className="note where">Buses to <b>{place.full}</b></p>}
        {walkAll !== null && walkAll <= 60 && <p className="note">Walking all the way from school: about {mins(walkAll)}.</p>}
        {top.map((t) => <RunCard key={t.r.run.key} r={t.r} tags={t.tags} on={selected.includes(t.r.run.key)} onToggle={() => toggle(t.r.run.key)} />)}
        {dest && !results.length && <p>No run found near there.</p>}
      </section>

      <main>
        <nav className="tabs">
          <button className={view === 'map' ? 'act' : ''} onClick={() => setView('map')}>Map</button>
          <button className={view === 'compare' ? 'act' : ''} onClick={() => setView('compare')} disabled={!dest}>Compare ({chosen.length})</button>
        </nav>
        <div className="stage">
          <div className="mapwrap" hidden={view !== 'map'}>
            <MapView school={school} dest={dest} destName={place?.label ?? ''} selected={chosen} fitKey={fitKey} visible={view === 'map'} />
          </div>
          {view === 'compare' && <Comparison results={chosen} />}
        </div>
      </main>

      {rest.length > 0 && (
        <section className="rest">
          <h3>Other runs</h3>
          {rest.map((r) => <RunRow key={r.run.key} r={r} on={selected.includes(r.run.key)} onToggle={() => toggle(r.run.key)} />)}
        </section>
      )}
    </div>
  )
}

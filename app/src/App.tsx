import { useEffect, useMemo, useState } from 'react'
import Comparison from './components/Comparison'
import MapView from './components/MapView'
import RunCard, { RunRow } from './components/RunCard'
import Segmented, { type Opt } from './components/Segmented'
import { geocode } from './lib/geocode'
import { mins } from './lib/format'
import { GREY, PALETTE, planTrips, prepare, sortResults, walkMinutes, withWalk } from './lib/plan'
import { dist } from './lib/geo'
import { walkingRoute, type Walk } from './lib/walking'
import type { Dataset, GeoHit, Mode, Pt, Result, Run, SortKey } from './types'

const MODES: Opt<Mode>[] = [
  { value: 'quick', label: 'Quickest', icon: 'bolt' },
  { value: 'close', label: 'Least walking', icon: 'walk' },
]
const SORTS: Opt<SortKey>[] = [
  { value: 'arrive', label: 'Arrive soonest', icon: 'clock' },
  { value: 'walk', label: 'Least walking', icon: 'walk' },
  { value: 'bus', label: 'Shortest ride', icon: 'bus' },
]

export default function App() {
  const [runs, setRuns] = useState<Run[]>([])
  const [school, setSchool] = useState<Pt>([-27.3595, 153.0640])
  const [loadErr, setLoadErr] = useState('')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<GeoHit[]>([])
  const [hit, setHit] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<Mode>('quick')
  const [sort, setSort] = useState<SortKey>('arrive')
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

  const dest: Pt | null = hits[hit] ? [hits[hit].lat, hits[hit].lon] : null
  const other: Mode = mode === 'quick' ? 'close' : 'quick'
  const baseA = useMemo(() => (dest ? planTrips(runs, dest, mode, sort) : []), [runs, dest, mode, sort])
  const baseB = useMemo(() => (dest ? planTrips(runs, dest, other, sort) : []), [runs, dest, other, sort])
  const wkey = (r: Result) => `${r.run.key}|${r.stop.lat},${r.stop.lon}|${dest?.join(',')}`

  // Real walking routes for the top results and for everything ticked (both stop choices).
  useEffect(() => {
    if (!dest) return
    let live = true
    const todo = [...baseA.slice(0, 8), ...baseA.filter((r) => selected.includes(r.run.key)), ...baseB.filter((r) => selected.includes(r.run.key))]
    todo.forEach((r) => {
      walkingRoute([r.stop.lat, r.stop.lon], dest).then((w) => { if (live && w) setWalks((p) => (p[wkey(r)] ? p : { ...p, [wkey(r)]: w })) })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseA, baseB, selected])

  // Each ticked run gets its own colour, in the order ticked; the rest stay grey.
  const paint = (r: Result): Result => {
    const i = selected.indexOf(r.run.key)
    return { ...r, run: { ...r.run, colour: i >= 0 ? PALETTE[i % PALETTE.length] : GREY } }
  }
  const real = (r: Result) => (walks[wkey(r)] ? withWalk(r, walks[wkey(r)]) : r)
  const results = useMemo(() => sortResults(baseA.map(real), sort).map(paint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseA, walks, sort, selected])
  const alt = useMemo(() => baseB.filter((r) => selected.includes(r.run.key)).map(real).map(paint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseB, walks, selected])
  const chosen = results.filter((r) => selected.includes(r.run.key))

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true); setErr('')
    try {
      const h = await geocode(q.trim())
      if (!h.length) { setErr('I could not find that place. Try adding the suburb.'); setHits([]); return }
      setHits(h); setHit(0)
      setSelected(planTrips(runs, [h[0].lat, h[0].lon], mode, sort).slice(0, 2).map((r) => r.run.key))
      setView('map'); setFitKey((k) => k + 1)
    } catch (x) {
      setErr('Search failed (' + (x as Error).message + '). Check your connection and try again.')
    } finally { setBusy(false) }
  }

  function toggle(key: string) {
    const on = selected.includes(key)
    setSelected(on ? selected.filter((k) => k !== key) : [...selected, key])
    if (!on) setFitKey((k) => k + 1)
  }

  const walkAll = dest ? walkMinutes(dist(school, dest)) : null
  const top = results.slice(0, 2)
  const rest = results.slice(2, 12)

  return (
    <div className="app">
      <section className="head">
        <header>
          <h1>Which bus home?</h1>
          <p>From St Joseph&rsquo;s Nudgee College &middot; prototype with estimated times</p>
        </header>
        <form onSubmit={search}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Place or address, e.g. Westfield Chermside" autoComplete="off" />
          <button disabled={busy || !runs.length}>{busy ? '…' : 'Find bus'}</button>
        </form>
        {loadErr && <p className="err pad">Could not load run data: {loadErr}</p>}
        {dest && (
          <div className="opts">
            <Segmented label="Where to get off" value={mode} onChange={setMode} options={MODES} />
            <Segmented label="Sort by" value={sort} onChange={setSort} options={SORTS} />
          </div>
        )}
      </section>

      <section className="top">
        {!dest && !err && (
          <p className="note">Type where you are going. Times are estimates worked out from road distance — the College sheets only give the 3:05 pm departure. Not yet checked by College Transport: always check BusMinder and your driver.</p>
        )}
        {err && <p className="err">{err}</p>}
        {dest && (
          <p className="note where">
            Buses to <b>{hits[hit].full}</b>
            {hits.length > 1 && <> · Not right? {hits.map((h, i) => (i === hit ? null : <a key={i} href="#" onClick={(e) => { e.preventDefault(); setHit(i); setFitKey((k) => k + 1) }}>{h.label} </a>))}</>}
          </p>
        )}
        {walkAll !== null && walkAll <= 60 && <p className="note">Walking all the way from school: about {mins(walkAll)}.</p>}
        {top.map((r, i) => <RunCard key={r.run.key} r={r} rank={i} on={selected.includes(r.run.key)} onToggle={() => toggle(r.run.key)} />)}
        {dest && !results.length && <p>No run found near there.</p>}
      </section>

      <main>
        <nav className="tabs">
          <button className={view === 'map' ? 'act' : ''} onClick={() => setView('map')}>Map</button>
          <button className={view === 'compare' ? 'act' : ''} onClick={() => setView('compare')} disabled={!dest}>Compare ({chosen.length})</button>
        </nav>
        <div className="stage">
          <div className="mapwrap" hidden={view !== 'map'}>
            <MapView school={school} dest={dest} destName={hits[hit]?.label ?? ''} selected={chosen} fitKey={fitKey} visible={view === 'map'} />
          </div>
          {view === 'compare' && <Comparison results={chosen} alt={alt} mode={mode} onMode={setMode} />}
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

import { useEffect, useMemo, useState } from 'react'
import Comparison from './components/Comparison'
import MapView from './components/MapView'
import RunCard from './components/RunCard'
import { geocode } from './lib/geocode'
import { mins } from './lib/format'
import { planTrips, prepare, sortResults, walkMinutes, withWalk } from './lib/plan'
import { walkingRoute, type Walk } from './lib/walking'
import { dist } from './lib/geo'
import type { Dataset, GeoHit, Mode, Pt, Result, Run, SortKey } from './types'

export default function App() {
  const [runs, setRuns] = useState<Run[]>([])
  const [school, setSchool] = useState<Pt>([-27.3387, 153.0716])
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

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/planner-data.json')
      .then((r) => r.json() as Promise<Dataset>)
      .then((d) => { setRuns(prepare(d)); setSchool(d.school) })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])

  const dest: Pt | null = hits[hit] ? [hits[hit].lat, hits[hit].lon] : null
  const base = useMemo(() => (dest ? planTrips(runs, dest, mode, sort) : []), [runs, dest, mode, sort])
  const [walks, setWalks] = useState<Record<string, Walk>>({})
  const wkey = (r: Result) => `${r.run.key}|${r.stop.lat},${r.stop.lon}|${dest?.join(',')}`
  useEffect(() => {
    if (!dest) return
    let live = true
    base.slice(0, 8).forEach((r) => {
      walkingRoute([r.stop.lat, r.stop.lon], dest).then((w) => { if (live && w) setWalks((p) => (p[wkey(r)] ? p : { ...p, [wkey(r)]: w })) })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])
  const results = useMemo(() => sortResults(base.map((r) => (walks[wkey(r)] ? withWalk(r, walks[wkey(r)]) : r)), sort), [base, walks, sort])
  const chosen = results.filter((r) => selected.includes(r.run.key))

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true); setErr('')
    try {
      const h = await geocode(q.trim())
      if (!h.length) { setErr('I could not find that place. Try adding the suburb.'); setHits([]); return }
      setHits(h); setHit(0)
      const first = planTrips(runs, [h[0].lat, h[0].lon], mode, sort)[0]
      setSelected(first ? [first.run.key] : [])
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

  return (
    <div className="app">
      <aside className="side">
        <header>
          <h1>Which bus home?</h1>
          <p>From St Joseph&rsquo;s Nudgee College &middot; prototype with estimated times</p>
        </header>
        <form onSubmit={search}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Place or address, e.g. Westfield Chermside" autoComplete="off" />
          <button disabled={busy || !runs.length}>{busy ? '…' : 'Find bus'}</button>
        </form>
        {loadErr && <p className="err">Could not load run data: {loadErr}</p>}
        {dest && (
          <div className="opts">
            <label>Where to get off
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="quick">Quickest way there (bus + walk)</option>
                <option value="close">Closest stop to destination</option>
              </select>
            </label>
            <label>Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="arrive">Arrive soonest</option>
                <option value="walk">Least walking</option>
                <option value="bus">Shortest bus ride</option>
              </select>
            </label>
          </div>
        )}
        <div className="results">
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
          {results.slice(0, 8).map((r, i) => <RunCard key={r.run.key} r={r} rank={i} on={selected.includes(r.run.key)} onToggle={() => toggle(r.run.key)} />)}
          {dest && !results.length && <p>No run found near there.</p>}
        </div>
      </aside>
      <main>
        <nav className="tabs">
          <button className={view === 'map' ? 'act' : ''} onClick={() => setView('map')}>Map</button>
          <button className={view === 'compare' ? 'act' : ''} onClick={() => setView('compare')} disabled={!dest}>Compare ({chosen.length})</button>
        </nav>
        <div className="stage">
          <div className="mapwrap" hidden={view !== 'map'}>
            <MapView school={school} dest={dest} destName={hits[hit]?.label ?? ''} selected={chosen} fitKey={fitKey} visible={view === 'map'} />
          </div>
          {view === 'compare' && <Comparison results={chosen} />}
        </div>
      </main>
    </div>
  )
}

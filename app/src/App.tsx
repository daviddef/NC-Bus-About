import { useEffect, useMemo, useState } from 'react'
import Comparison from './components/Comparison'
import MapView from './components/MapView'
import PtCard from './components/PtCard'
import RunCard, { RunRow } from './components/RunCard'
import Segmented, { type Opt } from './components/Segmented'
import SearchBox from './components/SearchBox'
import { svg } from './lib/icons'
import { addRecent, loadRecents, saveRecents, type Place } from './lib/places'
import { hhmm, mins } from './lib/format'
import { GREY, PALETTE, planTrips, prepare, sortResults, walkMinutes, withWalk } from './lib/plan'
import { dist } from './lib/geo'
import { buildNet, journeyCandidates, LEAVE_SCHOOL, viewOf, walkKey, type Net, type PtView, type TripsFile } from './lib/transit'
import { walkingRoute, type Walk } from './lib/walking'
import type { Dataset, Priority, PtOverlay, Pt, Result, Run } from './types'

type When = 'school' | 'at'
const WHEN: Opt<When>[] = [
  { value: 'school', label: 'After school', icon: 'school' },
  { value: 'at', label: 'Leave at', icon: 'clock' },
]
const nowMin = () => { const d = new Date(); return Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5 }
const timeStr = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const CATS: { pri: Priority; tag: string }[] = [
  { pri: 'quick', tag: 'Quickest' },
  { pri: 'stops', tag: 'Fewest stops' },
  { pri: 'walk', tag: 'Least walking' },
]

/** One way home, school bus or public transport, with the three numbers that decide between them. */
interface Option { id: string; where: string; arrive: number; walk: number; stops: number; school?: Result; pt?: PtView }
interface Pick { o: Option; tags: string[] }

const schoolOption = (r: Result): Option => ({ id: r.run.key, where: `${r.stop.lat},${r.stop.lon}`, arrive: r.arriveAt, walk: r.walkMin, stops: r.stopCount, school: r });
const ptOption = (v: PtView): Option => ({ id: 'pt:' + v.j.key, where: `${v.j.start}>${v.j.endStop}`, arrive: v.arriveAt, walk: v.walkMin, stops: v.j.stopsRidden + 6 * v.j.changes, pt: v });

/** Best option for each of the three things that matter, across school buses and public transport, each a different
 *  journey. One that wins twice (same way) carries both tags; the other category shows its runner-up ("2nd …"). */
function pickOptions(all: Option[]): Pick[] {
  if (!all.length) return []
  const quickest = Math.min(...all.map((o) => o.arrive))
  const ok = all.filter((o) => o.arrive <= quickest + 45)
  const calm = ok.filter((o) => o.walk <= 20)
  const cat = {
    quick: { pool: ok, by: (o: Option) => o.arrive * 100 + o.walk },
    stops: { pool: calm.length ? calm : ok, by: (o: Option) => o.stops * 1000 + o.arrive },
    walk: { pool: ok, by: (o: Option) => o.walk * 1000 + o.arrive },
  }
  const lists = Object.fromEntries(CATS.map((c) => [c.pri, [...cat[c.pri].pool].sort((a, b) => cat[c.pri].by(a) - cat[c.pri].by(b))])) as Record<Priority, Option[]>
  const out: Pick[] = []
  const owed: (typeof CATS)[number][] = []
  for (const c of CATS) {
    const w = lists[c.pri][0]
    if (!w) continue
    const same = out.find((p) => p.o.id === w.id && p.o.where === w.where)
    if (same) { same.tags.push(c.tag); owed.push(c) }
    else if (out.some((p) => p.o.id === w.id)) owed.push(c)
    else out.push({ o: w, tags: [c.tag] })
  }
  for (const c of owed) {
    const next = lists[c.pri].find((x) => !out.some((p) => p.o.id === x.id))
    if (next) out.push({ o: next, tags: ['2nd ' + c.tag.toLowerCase()] })
  }
  // And, if there is one, the best way by public transport with no changes at all.
  const direct = all.filter((o) => o.pt && o.pt.j.changes === 0 && o.arrive <= quickest + 90).sort((a, b) => a.arrive * 100 + a.walk - (b.arrive * 100 + b.walk))[0]
  if (direct) {
    const same = out.find((p) => p.o.id === direct.id && p.o.where === direct.where)
    if (same) same.tags.push('No changes')
    else if (!out.some((p) => p.o.id === direct.id)) out.push({ o: direct, tags: ['No changes'] })
  }
  return out
}

export default function App() {
  const [runs, setRuns] = useState<Run[]>([])
  const [school, setSchool] = useState<Pt>([-27.3595, 153.0640])
  const [loadErr, setLoadErr] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [recents, setRecents] = useState<Place[]>(() => loadRecents())
  const [when, setWhen] = useState<When>('school')
  const [atMin, setAtMin] = useState(nowMin)
  const [off, setOff] = useState<string[]>([]) // options hidden from the map
  const [extra, setExtra] = useState<string[]>([]) // other school runs ticked from the list
  const [view, setView] = useState<'map' | 'compare'>('map')
  const [fitKey, setFitKey] = useState(0)
  const [showPt, setShowPt] = useState(false)
  const [pt, setPt] = useState<PtOverlay | null>(null)
  const [ptLoading, setPtLoading] = useState(false)
  const [net, setNet] = useState<Net | null>(null)
  const [netLoading, setNetLoading] = useState(false)
  const [netErr, setNetErr] = useState('')
  const [walks, setWalks] = useState<Record<string, Walk>>({})

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'data/planner-data.json')
      .then((r) => r.json() as Promise<Dataset>)
      .then((d) => { setRuns(prepare(d)); setSchool(d.school) })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])

  const leave = when === 'school' ? LEAVE_SCHOOL : atMin
  // A school bus only works if it leaves soon after you do: not already gone, and not hours away.
  const viable = useMemo(() => (when === 'school' ? runs : runs.filter((r) => r.departMin >= atMin && r.departMin <= atMin + 30)), [runs, when, atMin])

  const dest: Pt | null = place ? [place.lat, place.lon] : null
  const baseA = useMemo(() => (dest ? planTrips(viable, dest, 'quick') : []), [viable, dest])
  const bases = useMemo(() => (dest ? Object.fromEntries(CATS.map((c) => [c.pri, planTrips(viable, dest, c.pri)])) as Record<Priority, Result[]> : null), [viable, dest])
  const noSchool = !!dest && runs.length > 0 && baseA.length === 0
  const includePt = showPt || noSchool

  function setPtOn(on: boolean) {
    setShowPt(on)
    if (on && !pt && !ptLoading) {
      setPtLoading(true)
      fetch(import.meta.env.BASE_URL + 'data/pt-overlay.json').then((r) => r.json() as Promise<PtOverlay>).then(setPt).catch(() => setShowPt(false)).finally(() => setPtLoading(false))
    }
  }
  // No school bus fits, so public transport is the answer: switch it on.
  useEffect(() => { if (noSchool && !showPt) setPtOn(true) }, [noSchool]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!includePt || net || netLoading) return
    setNetLoading(true); setNetErr('')
    fetch(import.meta.env.BASE_URL + 'data/pt-trips.json', { cache: 'no-cache' }).then((r) => r.json() as Promise<TripsFile>).then((f) => setNet(buildNet(f)))
      .catch((e: Error) => setNetErr(e.message)).finally(() => setNetLoading(false))
  }, [includePt, net, netLoading])

  const wkey = (r: Result) => `${r.run.key}|${r.stop.lat},${r.stop.lon}|${dest?.join(',')}`
  const real = (r: Result) => (walks[wkey(r)] ? withWalk(r, walks[wkey(r)]) : r)

  const cands = useMemo(() => (includePt && net && dest ? journeyCandidates(net, school, dest, leave) : []), [includePt, net, school, dest, leave])
  const ptViews = useMemo(() => (net && dest ? cands.map((j) => viewOf(net, j, school, dest, GREY, walks, leave)) : []), [cands, net, dest, school, walks, leave])

  const picks = useMemo(() => {
    if (!bases) return []
    const seen = new Set<string>()
    const school: Option[] = []
    for (const r of [...bases.quick, ...bases.stops, ...bases.walk].map(real)) {
      const o = schoolOption(r)
      if (!seen.has(o.id + o.where)) { seen.add(o.id + o.where); school.push(o) }
    }
    return pickOptions([...school, ...ptViews.map(ptOption)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, ptViews, walks])
  const pickIds = picks.map((p) => p.o.id)

  // Real walking routes for what we're showing, so times and lines follow the footpath.
  const todo: { key: string; from: Pt; to: Pt }[] = []
  if (dest) {
    baseA.slice(0, 8).forEach((r) => todo.push({ key: wkey(r), from: [r.stop.lat, r.stop.lon], to: dest }))
    if (bases) CATS.forEach((c) => bases[c.pri].slice(0, 3).forEach((r) => todo.push({ key: wkey(r), from: [r.stop.lat, r.stop.lon], to: dest })))
    if (net) picks.forEach((p) => {
      if (!p.o.pt) return
      const a = net.stops[p.o.pt.j.start].p, z = net.stops[p.o.pt.j.endStop].p
      todo.push({ key: walkKey(school, a), from: school, to: a }, { key: walkKey(z, dest), from: z, to: dest })
    })
  }
  const todoSig = todo.map((t) => t.key).join('|')
  useEffect(() => {
    let live = true
    todo.forEach((t) => walkingRoute(t.from, t.to).then((w) => { if (live && w) setWalks((p) => (p[t.key] ? p : { ...p, [t.key]: w })) }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoSig])

  // Colours follow the order shown: the top options first, then any other run ticked from the list.
  const colourOf = (id: string) => {
    const i = [...pickIds, ...extra].indexOf(id)
    return i >= 0 ? PALETTE[i % PALETTE.length] : GREY
  }
  const paintR = (r: Result): Result => ({ ...r, run: { ...r.run, colour: colourOf(r.run.key) } })
  const results = useMemo(() => sortResults(baseA.map(real), 'quick'), // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseA, walks])
  const shownPicks = picks.filter((p) => !off.includes(p.o.id))
  const chosen: Result[] = [
    ...shownPicks.filter((p) => p.o.school).map((p) => paintR(p.o.school!)),
    ...extra.map((k) => results.find((r) => r.run.key === k)).filter((r): r is Result => !!r).map(paintR),
  ]
  const journeys: PtView[] = shownPicks.filter((p) => p.o.pt).map((p) => ({ ...p.o.pt!, colour: colourOf(p.o.id) }))
  const rest = results.filter((r) => !pickIds.includes(r.run.key)).slice(0, 10)

  function reset() { setOff([]); setExtra([]); setView('map'); setFitKey((k) => k + 1) }
  function pick(p: Place) {
    setPlace(p)
    if (p.icon !== 'target') setRecents((r) => addRecent(r, p)) // never remember where someone actually is
    reset()
  }
  const toggle = (id: string, isPick: boolean) => {
    const list = isPick ? off : extra
    const turningOn = isPick ? list.includes(id) : !list.includes(id)
    const next = list.includes(id) ? list.filter((k) => k !== id) : [...list, id]
    if (isPick) setOff(next); else setExtra(next)
    if (turningOn) setFitKey((k) => k + 1)
  }

  const walkAll = dest ? walkMinutes(dist(school, dest)) : null
  const leaveNote = when === 'school' ? `Leaving school after school (school buses from ${hhmm(LEAVE_SCHOOL)})` : `Leaving school at ${hhmm(atMin)}`

  return (
    <div className="app">
      <section className="head">
        <header>
          <h1>Which bus home?</h1>
          <p>From St Joseph&rsquo;s Nudgee College &middot; prototype with estimated times</p>
        </header>
        <SearchBox ready={runs.length > 0} recents={recents} onPick={pick} onClearRecents={() => { setRecents([]); saveRecents([]) }} onClear={() => { setPlace(null); reset() }} />
        {loadErr && <p className="err pad">Could not load run data: {loadErr}</p>}
        {dest && (
          <div className="opts">
            <Segmented label="When" value={when} onChange={(v) => { setWhen(v); if (v === 'at') setAtMin(nowMin()); reset() }} options={WHEN} />
            {when === 'at' && (
              <label className="timerow">
                <span>Leaving at</span>
                <input type="time" step={300} value={timeStr(atMin)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!Number.isNaN(h)) { setAtMin(h * 60 + m); reset() } }} />
                <button type="button" className="nowbtn" onClick={() => { setAtMin(nowMin()); reset() }}>Now</button>
              </label>
            )}
            <button type="button" className={'ptchip' + (includePt ? ' on' : '')} aria-pressed={includePt} disabled={noSchool} onClick={() => setPtOn(!showPt)}>
              <span dangerouslySetInnerHTML={{ __html: svg('transit', 18) }} />
              <span>Include public transport</span>
              <i>{includePt ? 'On' : 'Off'}</i>
            </button>
          </div>
        )}
      </section>

      <section className="top">
        {!dest && (
          <p className="note">Type where you are going. Times are estimates worked out from road distance — the College sheets only give the 3:05 pm departure. Not yet checked by College Transport: always check BusMinder and your driver.</p>
        )}
        {place && <p className="note where">Ways to <b>{place.full}</b></p>}
        {dest && <p className="note">{leaveNote}.{noSchool && ' No school bus fits that time, so showing public transport.'}</p>}
        {walkAll !== null && walkAll <= 60 && <p className="note">Walking all the way from school: about {mins(walkAll)}.</p>}
        {includePt && (netLoading || (!net && !netErr)) && <p className="note">Loading timetables…</p>}
        {includePt && net && dest && !cands.length && <p className="note">No public transport found from the school to there when leaving at {hhmm(leave)}.</p>}
        {netErr && <p className="err pad">Could not load timetables: {netErr}</p>}
        {picks.map((p) => p.o.school
          ? <RunCard key={p.o.id} r={paintR(p.o.school)} tags={p.tags} on={!off.includes(p.o.id)} onToggle={() => toggle(p.o.id, true)} />
          : net && <PtCard key={p.o.id} v={{ ...p.o.pt!, colour: colourOf(p.o.id), j: { ...p.o.pt!.j, tags: p.tags } }} net={net} on={!off.includes(p.o.id)} onToggle={() => toggle(p.o.id, true)} />)}
        {dest && !picks.length && !netLoading && runs.length > 0 && <p>Nothing found for that time. Try turning on public transport.</p>}
      </section>

      <main>
        <nav className="tabs">
          <button className={view === 'map' ? 'act' : ''} onClick={() => setView('map')}>Map</button>
          <button className={view === 'compare' ? 'act' : ''} onClick={() => setView('compare')} disabled={!dest}>Compare ({chosen.length})</button>
        </nav>
        <div className="stage">
          <div className="mapwrap" hidden={view !== 'map'}>
            <MapView school={school} dest={dest} destName={place?.label ?? ''} selected={chosen} fitKey={fitKey} visible={view === 'map'} pt={pt} showPt={showPt} onTogglePt={() => setPtOn(!showPt)} ptLoading={ptLoading} journeys={journeys} net={net} />
          </div>
          {view === 'compare' && <Comparison results={chosen} />}
        </div>
      </main>

      {rest.length > 0 && (
        <section className="rest">
          <h3>Other school buses</h3>
          {rest.map((r) => <RunRow key={r.run.key} r={paintR(r)} on={extra.includes(r.run.key)} onToggle={() => toggle(r.run.key, false)} />)}
        </section>
      )}
    </div>
  )
}

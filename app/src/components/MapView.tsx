import { earlierStop } from './RunCard'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { bearing, dist } from '../lib/geo'
import { hhmm, metres, mins } from '../lib/format'
import { svg, type IconName } from '../lib/icons'
import { etaMin, project, walkMinutes } from '../lib/plan'
import type { Net, PtView } from '../lib/transit'
import type { PtOverlay, Pt, Result } from '../types'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/'

function Resize({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) setTimeout(() => map.invalidateSize(), 0)
  }, [visible, map])
  return null
}

function FitTo({ bounds, fitKey }: { bounds: Pt[]; fitKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [56, 56] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}

// ---- marker icons
const schoolIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div class="pulse"><span class="ring"></span><span class="ring r2"></span><span class="core">${svg('school', 13)}</span></div><div class="mlabel school-l">Nudgee College</div>`,
})
const destIcon = L.divIcon({
  className: '',
  iconSize: [34, 40],
  iconAnchor: [17, 38],
  html: `<div class="dpin">${svg('pin', 34)}</div><div class="mlabel dest-l">Destination</div>`,
})
const offIcon = (colour: string, time: string) =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="off" style="--c:${colour}"><span class="offic">${svg('bus', 17)}</span><span class="offt">${time}</span></div>`,
  })
const numIcon = (n: number, colour: string, dim = false) =>
  L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="num${dim ? ' dim' : ''}" style="background:${colour}">${n}</div>` })
const ideaIcon = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="idea"><span class="idring"></span><span class="idbulb">${svg('bulb', 16)}</span></div>` })
const arrowIcon = (deg: number, colour: string) =>
  L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<svg width="18" height="18" viewBox="0 0 16 16" style="transform:rotate(${deg}deg)"><path d="M8 1 L14 14 L8 10.5 L2 14Z" fill="${colour}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  })

function arrows(line: Pt[]): { at: Pt; deg: number }[] {
  const out: { at: Pt; deg: number }[] = []
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i])
    if (acc >= 600) { acc = 0; out.push({ at: line[i], deg: bearing(line[i - 1], line[i]) }) }
  }
  return out
}

// ---- popup content
function Pop({ icon, colour, title, sub, rows }: { icon: IconName; colour: string; title: string; sub?: string; rows?: ReactNode[] }) {
  return (
    <div className="pop">
      <div className="pophead">
        <span className="popic" style={{ background: colour }} dangerouslySetInnerHTML={{ __html: svg(icon, 16) }} />
        <div>
          <div className="poptitle">{title}</div>
          {sub && <div className="popsub">{sub}</div>}
        </div>
      </div>
      {rows && rows.length > 0 && <ul className="poprows">{rows.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  )
}

const PT_COLOUR: Record<string, string> = { '3': '#64748b', '2': '#0f172a', '0': '#0369a1', '4': '#0369a1' }
const PT_NAME: Record<string, string> = { '3': 'Bus', '2': 'Train', '0': 'Tram', '4': 'Ferry' }

/** TransLink buses, trains and ferries around the school: thin lines and small stops under the school runs. */
/** The services at a stop. Tap one to see only its route on the map; tap again for all of them. */
function StopLines({ lines, mode, focus }: { lines: [string, string, number[]][]; mode: string; focus: (hl: string[]) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const keys = lines.map(([route, to]) => `${route}|${to}`)
  return (
    <>
      {lines.map(([route, to, ms], i) => (
        <button type="button" key={keys[i]} className={'stline' + (sel === keys[i] ? ' on' : '')} aria-pressed={sel === keys[i]}
          onClick={() => { const next = sel === keys[i] ? null : keys[i]; setSel(next); focus(next ? [next] : keys) }}>
          <b>{mode === '2' ? 'Train' : route}</b> to {to}<br />
          <span>Leaves here at {ms.slice(0, 5).map((m) => hhmm(m)).join(' · ')}{ms.length > 5 ? ` … (${ms.length} in all)` : ''}</span>
        </button>
      ))}
    </>
  )
}

function PtLayer({ data, open, focus, only }: { data: PtOverlay; open: (at: Pt, node: ReactNode, hl?: string[]) => void; focus: (hl: string[]) => void; only: Set<string> | null }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  // Once a destination is chosen, only the services on our journeys: nothing else of the network.
  const keep = (route: string) => !only || only.has(route)
  const routes = data.routes.filter((r) => keep(r.id))
  const all = only ? data.stops.filter((s) => s.l.some(([route]) => keep(route))).map((s) => ({ ...s, l: s.l.filter(([route]) => keep(route)) })) : data.stops
  const stops = zoom >= 14 ? all : all.filter((s) => s.m === '2') // zoomed out: just the stations
  return (
    <>
      {routes.map((r, i) => r.g.map((g, j) => (
        <Polyline key={`${i}-${j}`} positions={g} interactive={false}
          pathOptions={{ color: PT_COLOUR[r.m] ?? '#64748b', weight: r.m === '2' ? 3 : 2, opacity: 0.55, dashArray: r.m === '2' ? '10 5' : undefined }} />
      )))}
      {routes.map((r, i) => (r.x ?? []).map((x, j) => (
        <Polyline key={`x${i}-${j}`} positions={x.g} interactive={false} pathOptions={{ color: '#fff', weight: 1.5, opacity: 0.95, dashArray: '2 5' }} />
      )))}
      {stops.map((s) => (
        <CircleMarker key={s.id} center={s.p} radius={s.m === '2' ? 5 : 3.5}
          pathOptions={{ color: PT_COLOUR[s.m] ?? '#64748b', weight: 2, fillColor: '#fff', fillOpacity: 1 }}
          eventHandlers={{
            click: () => open(s.p, (
              <Pop icon="transit" colour={PT_COLOUR[s.m] ?? '#64748b'} title={s.n} sub={`${PT_NAME[s.m] ?? 'Public transport'} · timetable, weekday 2:30–6 pm`}
                rows={[<StopLines key="l" lines={s.l} mode={s.m} focus={focus} />]} />
            ), [...new Set(s.l.map(([route, to]) => `${route}|${to}`))]),
          }} />
      ))}
    </>
  )
}

/** Public transport journeys home: walk, ride(s), walk. */
function JourneyLayer({ views, net, school, dest, open }: { views: PtView[]; net: Net; school: Pt; dest: Pt; open: (at: Pt, node: ReactNode) => void }) {
  return (
    <>
      {views.flatMap((v, vi) => v.j.rides.map((r, i) => <Polyline key={`c${vi}-${i}`} positions={r.path} interactive={false} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} />))}
      {views.map((v, vi) => {
        const { j } = v
        const a = net.stops[j.rides[0].board].p
        const z = net.stops[j.rides[j.rides.length - 1].alight].p
        const lastRide = j.rides[j.rides.length - 1]
        return (
          <Fragment key={vi}>
            <Polyline positions={v.first.path ? [school, ...v.first.path, a] : [school, a]} interactive={false} pathOptions={{ color: v.colour, weight: 4, dashArray: '1 8', lineCap: 'round' }} />
            {j.rides.map((r, i) => (
              <Fragment key={i}>
                {(() => {
                  // Journeys that ride the same service share a line: stripe their colours so none hides another.
                  const sharers = views.map((x, k) => (x.j.rides.some((q) => q.trip === r.trip) ? k : -1)).filter((k) => k >= 0)
                  const n = sharers.length, idx = sharers.indexOf(vi)
                  return n > 1
                    ? <Polyline positions={r.path} interactive={false} pathOptions={{ color: v.colour, weight: 5, opacity: 1, lineCap: 'butt', dashArray: `${12} ${12 * (n - 1)}`, dashOffset: String(-12 * idx) }} />
                    : <Polyline positions={r.path} interactive={false} pathOptions={{ color: v.colour, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
                })()}
                {arrows(r.path).map((ar, k) => <Marker key={k} position={ar.at} icon={arrowIcon(ar.deg, '#334155')} interactive={false} keyboard={false} />)}
                <CircleMarker center={net.stops[r.board].p} radius={7} pathOptions={{ color: v.colour, weight: 3, fillColor: '#fff', fillOpacity: 1 }}
                  eventHandlers={{ click: () => open(net.stops[r.board].p, <Pop icon="transit" colour={v.colour} title={`Get on: ${net.stops[r.board].n}`} sub={`${r.mode === '2' ? 'Train' : r.route} to ${r.headsign || 'end of line'}`} rows={[`${hhmm(r.boardAt)}`]} />) }} />
                {i > 0 && <Polyline positions={[net.stops[j.rides[i - 1].alight].p, net.stops[r.board].p]} interactive={false} pathOptions={{ color: v.colour, weight: 3, dashArray: '2 6' }} />}
              </Fragment>
            ))}
            <Polyline positions={v.last.path ? [z, ...v.last.path, dest] : [z, dest]} interactive={false} pathOptions={{ color: '#d6336c', weight: 4, dashArray: '1 8', lineCap: 'round' }} />
            <Marker position={z} icon={offIcon(v.colour, hhmm(lastRide.alightAt).replace(' ', ''))} zIndexOffset={800}
              eventHandlers={{ click: () => open(z, <Pop icon="transit" colour={v.colour} title={`Get off: ${net.stops[lastRide.alight].n}`} sub={`${lastRide.mode === '2' ? 'Train' : lastRide.route}`} rows={[`${hhmm(lastRide.alightAt)} · ${plural(lastRide.nStops, 'stop')}`, `Then ${v.last.real ? '' : '≈'}${mins(v.last.min)} walk (${metres(v.last.distM)})`]} />) }} />
          </Fragment>
        )
      })}
    </>
  )
}
/** What getting off at this stop would mean: the walk from here, when you'd be home, and how that compares with the card. */
function offRows(r: Result, s: { lat: number; lon: number; eta: number }, dest: Pt | null): ReactNode[] {
  if (!dest) return []
  const d = dist([s.lat, s.lon], dest), w = walkMinutes(d)
  const arr = r.run.departMin + s.eta + w
  const diff = Math.round(r.arriveAt - arr)
  const same = Math.abs(s.eta - r.stop.eta) < 0.5
  return [
    <span key="w"><b>If you get off here:</b> ≈{mins(w)} walk ({metres(d)}), home <b>{hhmm(arr)}</b></span>,
    same ? <span key="c">This is the stop on the card</span>
      : <span key="c" style={{ color: diff > 0 ? '#15803d' : diff < 0 ? '#b42318' : undefined, fontWeight: 700 }}>{diff > 0 ? `${mins(diff)} sooner than the card` : diff < 0 ? `${mins(-diff)} later than the card` : 'About the same as the card'}</span>,
  ]
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// ---- the pulse: a dot that travels each journey from the school to the destination in (sped-up) real time
interface TP { p: Pt; t: number }
type Mode = 'walk' | 'bus' | 'transit' | 'car'
interface Track { key: string; name: string; colour: string; pts: TP[]; start: number; end: number; legs: { t0: number; mode: Mode }[] }
/** Walking or riding at time t: the last leg that has started. */
const modeAt = (tr: Track, t: number): Mode => { let m: Mode = tr.legs[0]?.mode ?? 'walk'; for (const l of tr.legs) if (t >= l.t0) m = l.mode; return m }

function along(path: Pt[], t0: number, t1: number): TP[] {
  const d = [0]
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + dist(path[i - 1], path[i]))
  const total = d[d.length - 1] || 1
  return path.map((p, i) => ({ p, t: t0 + ((t1 - t0) * d[i]) / total }))
}
function finish(key: string, name: string, colour: string, raw: TP[], legs: Track['legs']): Track {
  let last = -Infinity
  const pts = raw.map((q) => ({ p: q.p, t: (last = Math.max(last, q.t)) }))
  return { key, name, colour, pts, start: pts[0].t, end: pts[pts.length - 1].t, legs }
}
function schoolTrack(r: Result, dest: Pt | null): Track {
  const { run, stop } = r
  const ride: TP[] = run.route.g.slice(0, stop.i + 1).map((p, i) => ({ p, t: run.departMin + etaMin(run, i) }))
  const here: Pt = [stop.lat, stop.lon]
  const walk = dest ? along(r.walkPath ? [here, ...r.walkPath, dest] : [here, dest], r.getOffAt, r.arriveAt) : []
  return finish(run.key, run.name.split(' · ')[0], run.colour, [...ride, ...walk], [{ t0: -Infinity, mode: 'bus' }, { t0: r.getOffAt, mode: 'walk' }])
}
function ptTrack(v: PtView, net: Net, school: Pt, dest: Pt): Track {
  const { j } = v
  const board = net.stops[j.rides[0].board].p
  const pts: TP[] = [...along([school, ...(v.first.path ?? []), board], v.leave, v.leave + v.first.min), { p: board, t: j.rides[0].boardAt }]
  j.rides.forEach((r, i) => {
    pts.push(...along(r.path, r.boardAt, r.alightAt))
    const nx = j.rides[i + 1]
    if (nx) pts.push({ p: net.stops[nx.board].p, t: nx.boardAt })
  })
  const last = j.rides[j.rides.length - 1]
  const legs: Track['legs'] = [{ t0: -Infinity, mode: 'walk' }]
  j.rides.forEach((r, i) => { legs.push({ t0: r.boardAt, mode: r.mode === '2' ? 'transit' : 'bus' }); legs.push({ t0: r.alightAt, mode: 'walk' }); void i })
  const z = net.stops[last.alight].p
  pts.push(...along([z, ...(v.last.path ?? []), dest], last.alightAt, v.arriveAt))
  return finish(String(vi(j)), j.rides.map((r) => (r.mode === '2' ? 'Train' : `Bus ${r.route}`)).join(' + '), v.colour, pts, legs)
}
const vi = (j: { key: string; start: number; endStop: number }) => `${j.key}:${j.start}:${j.endStop}`
function posAt(tr: Track, t: number): Pt {
  const a = tr.pts
  if (t <= a[0].t) return a[0].p
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i].t) {
      const span = a[i].t - a[i - 1].t
      const f = span > 0 ? (t - a[i - 1].t) / span : 1
      return [a[i - 1].p[0] + (a[i].p[0] - a[i - 1].p[0]) * f, a[i - 1].p[1] + (a[i].p[1] - a[i - 1].p[1]) * f]
    }
  }
  return a[a.length - 1].p
}
const pulseIcon = (colour: string, label: string, done: boolean, mode: Mode) =>
  L.divIcon({
    className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    html: done
      ? `<div class="pulser done" style="--c:${colour}"><span class="pdot tick">${svg('check', 13)}</span></div>`
      : `<div class="pulser" style="--c:${colour}"><span class="pring"></span><span class="pdot mv">${svg(mode, 14)}</span><span class="plabel">${label}</span></div>`,
  })
/** The stretch of a track already travelled by time t, ending at the pulse itself. */
function travelled(tr: Track, t: number): Pt[] {
  const out: Pt[] = []
  for (const q of tr.pts) { if (q.t > t) break; out.push(q.p) }
  out.push(posAt(tr, t))
  return out
}

const SPEED = 3 // journey minutes per real second, the same however many options are shown
const HOLD_MS = 6000 // long enough to read who got home when

/** A light-hearted way to say how much sooner this one gets home than the slowest option (and what to do with it). */
const JOKES: [number, ((n: number, slow: string) => string)[]][] = [
  [10, [
    (n, slow) => `🍪 ${n} min head start: snack secured before ${slow} lands`,
    (n) => `🎧 ${n} min: one whole song and a victory lap`,
    (n, slow) => `☕ ${n} min to raid the fridge before ${slow} gets in`,
    (n) => `🎒 ${n} min: unpack your bag before anyone asks`,
    (n) => `👟 ${n} min: shoes off and lunchbox out of the bag, before Mum finds it`,
  ]],
  [20, [
    (n, slow) => `🎮 ${n} min: one quick match before ${slow} turns up`,
    (n) => `📱 ${n} min of scrolling… sorry, “research”`,
    (n, slow) => `🧦 ${n} min: shoes off, feet up, before ${slow} is home`,
    (n) => `🍽️ ${n} min: empty the dishwasher, then ask for a favour`,
    (n) => `🧺 ${n} min: your washing in the machine, bonus points`,
    (n) => `🗑️ ${n} min: bins out. Parents will notice`,
  ]],
  [35, [
    (n) => `📚 Do your homework in ${n} min, before the last bus arrives`,
    (n) => `🏊 ${n} min of extra swim time`,
    (n) => `🛁 ${n} min: a long shower, hot water all yours`,
    (n) => `🌿 ${n} min: enough to mow the lawn. Probably`,
    (n) => `🐕 ${n} min: walk the dog, you're the favourite now`,
    (n) => `🧹 ${n} min: tidy your room before anyone says the words`,
  ]],
  [60, [
    (n, slow) => `🍕 ${n} min: pizza's nearly ready before ${slow} gets home`,
    (n, slow) => `📺 ${n} min: a whole episode before ${slow} arrives`,
    (n) => `🎸 ${n} min of guitar practice… or pretending to`,
    (n) => `🍳 ${n} min: cook dinner and become a legend`,
    (n) => `🚗 ${n} min: wash the car, then a very reasonable request`,
    (n) => `🧼 ${n} min: dishes, wipe the bench and unpack your bag`,
  ]],
  [Infinity, [
    (n) => `🎬 ${n} min: a full movie before the slowest gets home`,
    (n) => `😴 ${n} min: a power nap. You've earned it`,
    (n) => `🏀 ${n} min: shoot hoops, shower, still beat the last one`,
    (n) => `🌱 ${n} min: mow the lawn, water the garden, still beat the last one`,
    (n) => `🛒 ${n} min: a cheeky grocery run, then dinner's on you`,
  ]],
]
const LAST = ['🐢 Last one home. Podcast time!', '🎧 Last home: queue a long playlist', '🐌 The scenic route. Enjoy the view', '🧠 Last home: plenty of time to think up an excuse', '🙈 Last home: the dishwasher is already empty. Not your fault']
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
function fun(gap: number, slow: string, seed: string): string {
  const m = Math.round(gap)
  if (m < 1) return LAST[hash(seed) % LAST.length]
  const list = JOKES.find(([max]) => m < max)![1]
  return list[hash(seed) % list.length](m, slow)
}

/** Plays the clock from the earliest start to the latest arrival, looping. */
function Pulses({ tracks, playing }: { tracks: Track[]; playing: boolean }) {
  const [t, setT] = useState<number | null>(null)
  const prog = useRef(0)
  const sig = tracks.map((k) => k.key).join('|')
  const start = Math.min(...tracks.map((k) => k.start))
  const end = Math.max(...tracks.map((k) => k.end))
  useEffect(() => { prog.current = 0 }, [sig])
  useEffect(() => {
    if (!tracks.length) return
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      if (playing) {
        const travel = Math.max(4000, ((end - start) / SPEED) * 1000)
        prog.current = (prog.current + (now - last)) % (travel + HOLD_MS)
        setT(start + Math.min(end - start, (prog.current / 1000) * SPEED))
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, playing])
  if (t === null) return null
  const slowest = Math.max(...tracks.map((k) => k.end))
  const slowName = tracks.find((k) => k.end === slowest)?.name ?? 'the last one'
  const home = tracks.filter((k) => t >= k.end).sort((a, b) => a.end - b.end)
  return (
    <>
      <div className="arrivals" aria-live="polite">
        {home.map((k) => (
          <div className="arr1" key={k.key} style={{ ['--c' as string]: k.colour }}>
            <b>{k.name}</b> home <b>{hhmm(k.end)}</b> <span>· {mins(k.end - k.start)}</span>
            {tracks.length > 1 && <div className="fun">{fun(slowest - k.end, slowName, k.key)}</div>}
          </div>
        ))}
      </div>
      {tracks.map((k) => (t > k.start ? <Polyline key={'d' + k.key} positions={travelled(k, t)} interactive={false} pathOptions={{ color: '#fff', weight: 9, opacity: 0.72, lineCap: 'round', lineJoin: 'round' }} /> : null))}
      {tracks.map((k) => {
        const done = t >= k.end
        const label = done ? `Arrived ${hhmm(k.end).replace(' ', '')} · ${mins(k.end - k.start)}` : `${hhmm(Math.max(t, k.start)).replace(' ', '')} · ${mins(Math.max(0, t - k.start))}`
        return <Marker key={k.key} position={posAt(k, t)} icon={pulseIcon(k.colour, label, done, modeAt(k, t))} interactive={false} keyboard={false} zIndexOffset={1500} />
      })}
    </>
  )
}

interface Props {
  school: Pt
  dest: Pt | null
  destName: string
  selected: Result[]
  fitKey: number
  visible: boolean
  drive?: { path: Pt[]; colour: string; start: number; end: number } | null
  pt: PtOverlay | null
  showPt: boolean
  onTogglePt: () => void
  ptLoading: boolean
  journeys: PtView[]
  net: Net | null
}

export default function MapView({ school, dest, destName, selected, fitKey, visible, pt, showPt, onTogglePt, ptLoading, journeys, net, drive }: Props) {
  const [popup, setPopup] = useState<{ at: Pt; node: ReactNode; hl: string[] } | null>(null)
  const open = (at: Pt, node: ReactNode, hl: string[] = []) => setPopup({ at, node, hl })
  const [playing, setPlaying] = useState(true)
  const tracks = useMemo(() => {
    if (!dest) return []
    const out: Track[] = selected.map((r) => schoolTrack(r, dest))
    if (net) journeys.forEach((v) => out.push(ptTrack(v, net, school, dest)))
    if (drive) out.push(finish('drive', 'Drive', drive.colour, along(drive.path, drive.start, drive.end), [{ t0: -Infinity, mode: 'car' }]))
    return out.filter((k) => k.pts.length > 1)
  }, [selected, journeys, net, school, dest, drive])
  const bounds: Pt[] = [school]
  if (dest) bounds.push(dest)
  journeys.forEach((v) => v.j.rides.forEach((r) => r.path.forEach((p, i) => i % 4 === 0 && bounds.push(p))))
  selected.forEach((r) => {
    bounds.push([r.stop.lat, r.stop.lon])
    r.run.route.g.slice(0, r.stop.i + 1).forEach((p, i) => i % 12 === 0 && bounds.push(p))
  })

  return (
    <div className="mapbox">
      <MapContainer center={school} zoom={12} className="map" zoomControl>
        <TileLayer attribution="Tiles &copy; Esri" url={ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} />
        <TileLayer url={ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} pane="shadowPane" />
        <Resize visible={visible} />
        <FitTo bounds={bounds} fitKey={fitKey} />

        {showPt && pt && <PtLayer data={pt} open={open} focus={(hl) => setPopup((p) => (p ? { ...p, hl } : p))} only={dest ? new Set(journeys.flatMap((v) => v.j.rides.map((r) => r.route))) : null} />}
        {pt && popup && popup.hl.length > 0 && pt.routes.filter((r) => popup.hl.some((k) => k.startsWith(`${r.id}|`))).map((r, i) => r.g.map((g, j) => !popup.hl.includes(`${r.id}|${r.h?.[j] ?? ''}`) && r.h ? null : (
          <Fragment key={`hl${i}-${j}`}>
            <Polyline positions={g} interactive={false} pathOptions={{ color: '#7c5a00', weight: 11, opacity: 0.55 }} />
            <Polyline positions={g} interactive={false} pathOptions={{ color: '#ffd400', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          </Fragment>
        )))}
        {pt && popup && popup.hl.length > 0 && pt.routes.filter((r) => popup.hl.some((k) => k.startsWith(`${r.id}|`))).map((r, i) => (r.x ?? []).filter((x) => popup.hl.includes(`${r.id}|${x.h}`)).map((x, j) => (
          <Polyline key={`hx${i}-${j}`} positions={x.g} pathOptions={{ color: '#7c5a00', weight: 5, opacity: 1, dashArray: '1 9', lineCap: 'round' }}>
            <Tooltip sticky>No stops along here (tunnel or non-stop)</Tooltip>
          </Polyline>
        )))}

        {drive && (
          <>
            <Polyline positions={drive.path} interactive={false} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} />
            <Polyline positions={drive.path} interactive={false} pathOptions={{ color: drive.colour, weight: 5, opacity: 0.9, dashArray: '10 8', lineCap: 'round' }} />
          </>
        )}
        {net && dest && journeys.length > 0 && <JourneyLayer views={journeys} net={net} school={school} dest={dest} open={open} />}

        {selected.map((r) => {
          const { run, stop } = r
          const g = run.route.g
          const mine = g.slice(0, stop.i + 1)
          const rest = g.slice(stop.i)
          const here: Pt = [stop.lat, stop.lon]
          const named = r.stops.filter((s) => s.k === 'stop').sort((a, b) => a.i - b.i)
          const tip = earlierStop(r, dest)
          return (
            <Fragment key={run.key}>
              {tip && (
                <Marker position={[tip.s.lat, tip.s.lon]} icon={ideaIcon} zIndexOffset={900}
                  eventHandlers={{ click: () => open([tip.s.lat, tip.s.lon], <Pop icon="bolt" colour="#f59e0b" title={`Get off here, stop ${tip.n}`} sub={`${run.name.split(' · ')[0]} · about ${hhmm(run.departMin + tip.s.eta)}`} rows={[tip.s.t, `≈${mins(tip.walk)} walk, home ${mins(Math.round(tip.save))} sooner than the stop on the card`]} />) }} />
              )}
              <Polyline positions={rest} pathOptions={{ color: run.colour, weight: 3, opacity: 0.4, dashArray: '1 8', lineCap: 'round' }} interactive={false} />
              <Polyline positions={mine} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} interactive={false} />
              <Polyline positions={mine} pathOptions={{ color: run.colour, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
              <Polyline
                positions={g}
                pathOptions={{ color: run.colour, weight: 24, opacity: 0 }}
                eventHandlers={{
                  click: (e) => {
                    const p: Pt = [e.latlng.lat, e.latlng.lng]
                    const pr = project(run, p)
                    const t = run.departMin + etaMin(run, pr.i)
                    let nb: { s: (typeof r.stops)[number]; d: number } | null = null
                    for (const s of r.stops) {
                      const d = dist([s.lat, s.lon], p)
                      if (!nb || d < nb.d) nb = { s, d }
                    }
                    open(p, (
                      <Pop icon="bus" colour={run.colour} title={run.name} sub={`Bus is here about ${hhmm(t)}`}
                        rows={[`${mins(etaMin(run, pr.i))} after leaving school`, nb && nb.d <= 250 ? `Nearest stop: ${nb.s.t} (${metres(nb.d)})` : 'No listed stop within 250 m']} />
                    ))
                  },
                }}
              />
              {arrows(mine).map((a, i) => <Marker key={i} position={a.at} icon={arrowIcon(a.deg, run.colour)} interactive={false} keyboard={false} />)}
              {r.stops.filter((s) => s.k === 'seg' && s.i <= stop.i).map((s, i) => (
                <CircleMarker key={i} center={[s.lat, s.lon]} radius={4} pathOptions={{ color: run.colour, weight: 2, fillColor: '#fff', fillOpacity: 1 }}
                  eventHandlers={{ click: () => open([s.lat, s.lon], <Pop icon="stop" colour={run.colour} title={s.t} sub={`${run.name.split(' · ')[0]} · about ${hhmm(run.departMin + s.eta)}`} rows={[...(s.road ? [`On ${s.road}`, 'Bus stops here only if asked, where safe'] : []), ...offRows(r, s, dest)]} />) }} />
              ))}
              {named.map((s, i) => (
                <Marker key={'n' + i} position={[s.lat, s.lon]} icon={numIcon(i + 1, run.colour, s.i > stop.i)} zIndexOffset={s.i > stop.i ? -500 : 0}
                  eventHandlers={{ click: () => open([s.lat, s.lon], <Pop icon="stop" colour={run.colour} title={s.t} sub={`${run.name.split(' · ')[0]} · stop ${i + 1} · about ${hhmm(run.departMin + s.eta)}`} rows={offRows(r, s, dest)} />) }} />
              ))}
              {dest && (
                <Polyline
                  positions={r.walkPath ? [here, ...r.walkPath, dest] : [here, dest]}
                  pathOptions={{ color: '#d6336c', weight: 4, dashArray: r.walkPath ? '1 8' : '6 8', lineCap: 'round' }}
                  eventHandlers={{
                    click: (e) => open([e.latlng.lat, e.latlng.lng], (
                      <Pop icon="walk" colour="#d6336c" title={`Walk ${r.walkReal ? '' : '≈'}${metres(r.distM)} · ${r.walkReal ? '' : '≈'}${mins(r.walkMin)}`} sub={r.walkReal ? 'Along the walking route' : 'Straight-line estimate'} />
                    )),
                  }}
                />
              )}
              <Marker position={here} icon={offIcon(run.colour, hhmm(r.getOffAt).replace(' ', ''))} zIndexOffset={800}
                eventHandlers={{
                  click: () => open(here, (
                    <Pop icon="bus" colour={run.colour} title={`Get off: ${stop.t}`} sub={run.name}
                      rows={[`${hhmm(r.getOffAt)} · ${mins(r.busMin)} on the bus · ${r.stopCount} stop${r.stopCount === 1 ? '' : 's'}`, `Then ${r.walkReal ? '' : '≈'}${mins(r.walkMin)} walk (${metres(r.distM)})`, stop.k === 'seg' ? `A stop on ${stop.road}` : 'Named stop on the run sheet']} />
                  )),
                }} />
            </Fragment>
          )
        })}

        {dest && (
          <Marker position={dest} icon={destIcon} zIndexOffset={900}
            eventHandlers={{ click: () => open(dest, <Pop icon="pin" colour="#d6336c" title="Destination" sub={destName} />) }} />
        )}
        <Marker position={school} icon={schoolIcon} zIndexOffset={1000}
          eventHandlers={{ click: () => open(school, <Pop icon="school" colour="#e11d2e" title="St Joseph’s Nudgee College" sub="Every afternoon run starts here" />) }} />

        {tracks.length > 0 && <Pulses tracks={tracks} playing={playing} />}

        {popup && (
          <Popup position={popup.at} className="ncpop" offset={[0, -6]} eventHandlers={{ remove: () => setPopup(null) }}>
            {popup.node}
          </Popup>
        )}
      </MapContainer>

      <div className="ptwrap">
        {tracks.length > 0 && (
          <button type="button" className="ptbtn" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
            <span dangerouslySetInnerHTML={{ __html: svg(playing ? 'pause' : 'play', 18) }} />
            <span>{playing ? 'Pause' : 'Play trip'}</span>
          </button>
        )}
        <button type="button" className={'ptbtn' + (showPt ? ' on' : '')} aria-pressed={showPt} onClick={onTogglePt}>
          <span dangerouslySetInnerHTML={{ __html: svg('transit', 18) }} />
          <span>{ptLoading ? 'Loading…' : 'Public transport'}</span>
        </button>
        {showPt && pt && <div className="ptnote">{dest ? 'Only the services on your options.' : 'Buses, trains and ferries (grey, black dashes).'} Dotted white = no stops along that stretch. Zoom in for stops; tap one for times. TransLink timetable for a school-term weekday, CC BY 4.0. Check TransLink for today.</div>}
      </div>

      {(selected.length > 0 || journeys.length > 0 || !!drive) && (
        <div className="legend" aria-label="Selected options">
          {selected.map((r) => (
            <div className="lg" key={r.run.key} style={{ ['--c' as string]: r.run.colour }}>
              <span className="lgsw" />
              <b>{r.run.name.split(' · ')[0]}</b>
              <span>off {hhmm(r.getOffAt)}</span>
              <span className="lgwalk" dangerouslySetInnerHTML={{ __html: `${svg('walk', 13)} ${r.walkReal ? '' : '≈'}${mins(r.walkMin)}` }} />
            </div>
          ))}
          {drive && (
            <div className="lg" style={{ ['--c' as string]: drive.colour }}>
              <span className="lgsw" />
              <b>Drive</b>
              <span>home {hhmm(drive.end)}</span>
            </div>
          )}
          {journeys.map((v) => (
            <div className="lg" key={v.j.key} style={{ ['--c' as string]: v.colour }}>
              <span className="lgsw" />
              <b>{v.j.rides.map((r) => (r.mode === '2' ? 'Train' : `Bus ${r.route}`)).join(' + ')}</b>
              <span>home {hhmm(v.arriveAt)}</span>
              <span className="lgwalk" dangerouslySetInnerHTML={{ __html: `${svg('walk', 13)} ≈${mins(v.walkMin)}` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

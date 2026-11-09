// Public transport journeys from the school, worked out in the browser from TransLink's open GTFS
// (afternoon trips cut by scripts/export_pt_trips.py) with a connection scan.
import { dist } from './geo'
import { walkMinutes } from './plan'
import type { Pt } from '../types'

export interface TripsFile {
  date: string
  stops: [string, number, number][]
  routes: [string, string][]
  trips: [number, string, number, number[], number[], number[]][]
}

export const LEAVE_SCHOOL = 15 * 60 + 5 // 3:05 pm, the time the College buses leave; the default "after school" time
const BOARD_BUFFER = 1 // minutes spare when stepping onto the first service
const CHANGE_BUFFER = 2 // minutes to change between services at the same stop
const MAX_WALK_M = 1700 // furthest we'll ask anyone to walk to a first or last stop
const NEAR_M = 250 // stops this close count as a walkable change

interface Trip { r: number; hs: string; t0: number; s: number[]; a: number[]; d: number[] }

export interface Net {
  stops: { n: string; p: Pt }[]
  routes: { id: string; m: string }[]
  trips: Trip[]
  cDep: Float64Array; cArr: Float64Array; cFrom: Int32Array; cTo: Int32Array; cTrip: Int32Array; cPos: Int32Array
  walk: { to: number; min: number }[][]
}

export function buildNet(f: TripsFile): Net {
  const stops = f.stops.map(([n, la, lo]) => ({ n, p: [la, lo] as Pt }))
  const trips: Trip[] = f.trips.map(([r, hs, t0, s, a, d]) => ({ r, hs, t0, s, a, d }))
  const rows: number[][] = []
  trips.forEach((t, ti) => {
    for (let i = 0; i < t.s.length - 1; i++) rows.push([t.t0 + t.d[i], t.t0 + t.a[i + 1], t.s[i], t.s[i + 1], ti, i])
  })
  rows.sort((x, y) => x[0] - y[0])
  const n = rows.length
  const net: Net = {
    stops, trips, routes: f.routes.map(([id, m]) => ({ id, m })),
    cDep: new Float64Array(n), cArr: new Float64Array(n), cFrom: new Int32Array(n), cTo: new Int32Array(n), cTrip: new Int32Array(n), cPos: new Int32Array(n),
    walk: stops.map(() => []),
  }
  rows.forEach((r, i) => { net.cDep[i] = r[0]; net.cArr[i] = r[1]; net.cFrom[i] = r[2]; net.cTo[i] = r[3]; net.cTrip[i] = r[4]; net.cPos[i] = r[5] })
  // walkable changes between nearby stops (grid of ~0.003 degrees)
  const grid = new Map<string, number[]>()
  const cell = (p: Pt) => `${Math.floor(p[0] / 0.003)},${Math.floor(p[1] / 0.003)}`
  stops.forEach((s, i) => { const k = cell(s.p); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i) })
  stops.forEach((s, i) => {
    const cx = Math.floor(s.p[0] / 0.003), cy = Math.floor(s.p[1] / 0.003)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (j === i) continue
        const d = dist(s.p, stops[j].p)
        if (d <= NEAR_M) net.walk[i].push({ to: j, min: walkMinutes(d) + 1 })
      }
    }
  })
  return net
}

function near(net: Net, p: Pt, limit: number): { s: number; d: number }[] {
  const out: { s: number; d: number }[] = []
  net.stops.forEach((st, s) => { const d = dist(p, st.p); if (d <= MAX_WALK_M) out.push({ s, d }) })
  return out.sort((a, b) => a.d - b.d).slice(0, limit)
}

interface Labels { arr: Float64Array; kind: Int8Array; pTrip: Int32Array; pBoard: Int32Array; pAlight: Int32Array; pFrom: Int32Array }

/** Earliest arrival at every stop, starting at one stop at one time. */
function scan(net: Net, origin: number, start: number): Labels {
  const n = net.stops.length
  const L: Labels = { arr: new Float64Array(n).fill(Infinity), kind: new Int8Array(n), pTrip: new Int32Array(n).fill(-1), pBoard: new Int32Array(n), pAlight: new Int32Array(n), pFrom: new Int32Array(n).fill(-1) }
  const board = new Int32Array(net.trips.length).fill(-1)
  L.arr[origin] = start
  for (const w of net.walk[origin]) if (start + w.min < L.arr[w.to]) { L.arr[w.to] = start + w.min; L.kind[w.to] = 2; L.pFrom[w.to] = origin }
  const stopAt = start + 150
  let lo = 0, hi = net.cDep.length // first connection departing at or after the start
  while (lo < hi) { const m = (lo + hi) >> 1; if (net.cDep[m] < start) lo = m + 1; else hi = m }
  for (let c = lo; c < net.cDep.length; c++) {
    const dep = net.cDep[c]
    if (dep > stopAt) break
    const tr = net.cTrip[c]
    if (board[tr] < 0) {
      const f = net.cFrom[c]
      const buf = L.kind[f] === 1 ? CHANGE_BUFFER : f === origin ? 0 : 1
      if (L.arr[f] + buf <= dep) board[tr] = net.cPos[c]
    }
    if (board[tr] < 0) continue
    const to = net.cTo[c], arr = net.cArr[c]
    if (arr < L.arr[to]) {
      L.arr[to] = arr; L.kind[to] = 1; L.pTrip[to] = tr; L.pBoard[to] = board[tr]; L.pAlight[to] = net.cPos[c] + 1
      for (const w of net.walk[to]) if (arr + w.min < L.arr[w.to]) { L.arr[w.to] = arr + w.min; L.kind[w.to] = 2; L.pFrom[w.to] = to }
    }
  }
  return L
}

export interface Ride { trip: number; route: string; mode: string; headsign: string; board: number; alight: number; boardAt: number; alightAt: number; nStops: number; path: Pt[] }
export interface Journey {
  key: string
  start: number // stop the first walk ends at
  rides: Ride[]
  changeWalkMin: number // walking between stops when changing
  firstWalkM: number; lastWalkM: number
  endStop: number
  transitArrive: number
  stopsRidden: number
  changes: number
  walkMin: number // all walking, estimated
  arriveAt: number // at the destination, estimated walk
  tags: string[]
}

function rebuild(net: Net, L: Labels, end: number): { rides: Ride[]; changeWalk: number; first: number } | null {
  const rides: Ride[] = []
  let s = end, changeWalk = 0
  for (let guard = 0; guard < 14; guard++) {
    if (L.kind[s] === 1) {
      const t = net.trips[L.pTrip[s]], b = L.pBoard[s], a = L.pAlight[s]
      rides.unshift({
        trip: L.pTrip[s], route: net.routes[t.r].id, mode: net.routes[t.r].m, headsign: t.hs, board: t.s[b], alight: t.s[a],
        boardAt: t.t0 + t.d[b], alightAt: t.t0 + t.a[a], nStops: a - b, path: t.s.slice(b, a + 1).map((i) => net.stops[i].p),
      })
      s = t.s[b]
    } else if (L.kind[s] === 2) {
      const from = L.pFrom[s]
      const d = dist(net.stops[from].p, net.stops[s].p)
      changeWalk += walkMinutes(d) + 1
      s = from
    } else return rides.length ? { rides, changeWalk: changeWalk, first: s } : null
  }
  return null
}

/** Every sensible way to get from the school to the destination by public transport, leaving at `leave`. */
export function journeyCandidates(net: Net, school: Pt, dest: Pt, leave: number): Journey[] {
  const starts = near(net, school, 6)
  const ends = near(net, dest, 40)
  const all: Journey[] = []
  for (const o of starts) {
    const t0 = leave + walkMinutes(o.d) + BOARD_BUFFER
    const L = scan(net, o.s, t0)
    for (const e of ends) {
      if (!isFinite(L.arr[e.s]) || e.s === o.s) continue
      const rb = rebuild(net, L, e.s)
      if (!rb || rb.first !== o.s) continue
      if (rb.rides.some((r, i) => i > 0 && r.route === rb.rides[i - 1].route)) continue // changing onto the same route is pointless
      const lastWalk = walkMinutes(e.d)
      const walk = walkMinutes(o.d) + rb.changeWalk + lastWalk
      const ridden = rb.rides.reduce((n, r) => n + r.nStops, 0)
      all.push({
        key: rb.rides.map((r) => r.trip).join('+'), start: o.s, rides: rb.rides, changeWalkMin: rb.changeWalk, firstWalkM: o.d, lastWalkM: e.d, endStop: e.s,
        transitArrive: L.arr[e.s], stopsRidden: ridden, changes: rb.rides.length - 1, walkMin: walk, arriveAt: L.arr[e.s] + lastWalk, tags: [],
      })
    }
  }
  return all
}

export interface Seg { min: number; distM: number; real: boolean; path?: Pt[] }
export interface PtView {
  j: Journey
  colour: string
  first: Seg
  last: Seg
  walkMin: number
  arriveAt: number
  leave: number // when they set off from school
  leaveBy: number // when to leave school to catch the first service
  tight: boolean // the walk to the first stop leaves no time to spare
}

export const walkKey = (a: Pt, b: Pt) => `${a.join(',')}>${b.join(',')}`

/** Swap in real walking routes for the first and last walk when we have them. */
export function viewOf(net: Net, j: Journey, school: Pt, dest: Pt, colour: string, walks: Record<string, { path: Pt[]; distM: number; min: number }>, leave: number): PtView {
  const a = net.stops[j.start].p, b = net.stops[j.endStop].p
  const wf = walks[walkKey(school, a)], wl = walks[walkKey(b, dest)]
  const first: Seg = wf ? { min: wf.min, distM: wf.distM, real: true, path: wf.path } : { min: walkMinutes(j.firstWalkM), distM: j.firstWalkM, real: false }
  const last: Seg = wl ? { min: wl.min, distM: wl.distM, real: true, path: wl.path } : { min: walkMinutes(j.lastWalkM), distM: j.lastWalkM, real: false }
  const boardAt = j.rides[0].boardAt
  return {
    j, colour, first, last, walkMin: first.min + j.changeWalkMin + last.min, arriveAt: j.transitArrive + last.min,
    leave, leaveBy: boardAt - first.min, tight: leave + first.min > boardAt - 0.5,
  }
}

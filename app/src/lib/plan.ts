import { dist } from './geo'
import type { Dataset, Priority, Pt, Result, Run, StopOption } from '../types'

export const PALETTE = ['#1a56db', '#e65100', '#2e7d32', '#8e24aa', '#c2185b', '#00838f', '#6d4c41', '#455a64']
export const GREY = '#8a94a6'
const BUS_FACTOR = 1.3 // school bus assumed this much slower than a car
const MAX_OFF = 250 // metres: a road stop must be this close to the drawn route
export const walkMinutes = (d: number) => (d * 1.3) / 80 // 80 m/min, +30% for streets

export function prepare(ds: Dataset): Run[] {
  return ds.runs.map((r, i) => {
    // Start the drawn line exactly at the school, not at the nearest road point the router snapped to.
    const g: Pt[] = r.route.g.length && dist(ds.school, r.route.g[0]) > 5 ? [ds.school, ...r.route.g] : r.route.g
    const cum = [0]
    for (let k = 1; k < g.length; k++) cum.push(cum[k - 1] + dist(g[k - 1], g[k]))
    const total = cum[cum.length - 1] || 1
    const [h, m] = (r.depart ?? '15:05').split(':').map(Number)
    return {
      ...r,
      route: { ...r.route, g },
      colour: PALETTE[i % PALETTE.length],
      cum,
      total,
      departMin: h * 60 + m,
      secTotal: (r.route.ok && r.route.dur ? r.route.dur : total / 8.3) * BUS_FACTOR,
    }
  })
}

export function project(run: Run, pt: Pt): { i: number; off: number } {
  let bi = 0
  let bd = Infinity
  run.route.g.forEach((v, i) => {
    const d = dist(v, pt)
    if (d < bd) { bd = d; bi = i }
  })
  return { i: bi, off: bd }
}

export const etaMin = (run: Run, i: number) => (run.secTotal / 60) * (run.cum[i] / run.total)

export function stopsFor(run: Run): StopOption[] {
  const out: StopOption[] = []
  for (const p of run.points) {
    if (p.k === 'stop' && p.status !== 'strong' && p.status !== 'possible') continue
    const pr = project(run, [p.lat, p.lon])
    if (p.k === 'seg' && pr.off > MAX_OFF) continue
    out.push({ ...p, i: pr.i, off: pr.off, eta: etaMin(run, pr.i) })
  }
  return out
}

/** Stops from the school up to and including the get-off stop. The two sides of a road count once. */
export function countStops(stops: StopOption[], upTo: number): number {
  const kept: StopOption[] = []
  for (const s of stops.filter((x) => x.i <= upTo).sort((a, b) => a.i - b.i)) {
    const last = kept[kept.length - 1]
    if (!last || dist([last.lat, last.lon], [s.lat, s.lon]) > 40) kept.push(s)
  }
  return Math.max(kept.length, 1)
}

export function planTrips(runs: Run[], dest: Pt, pri: Priority): Result[] {
  const res: Result[] = []
  for (const run of runs) {
    const stops = stopsFor(run)
    if (!stops.length) continue
    const cands = stops.map((s) => {
      const d = dist([s.lat, s.lon], dest)
      return { s, d, w: walkMinutes(d), n: countStops(stops, s.i) }
    })
    // Fewest stops: only stops with a sensible walk, else the stop would just be the first one on the road.
    const pool = pri === 'stops' ? (cands.filter((c) => c.w <= 15).length ? cands.filter((c) => c.w <= 15) : cands) : cands
    const key = (c: (typeof cands)[number]) => (pri === 'walk' ? c.d : pri === 'stops' ? c.n * 1000 + c.s.eta + c.w : c.s.eta + c.w)
    const best = pool.reduce((m, c) => (key(c) < key(m) ? c : m))
    const arriveAt = run.departMin + best.s.eta + best.w
    res.push({
      run, stop: best.s, stops, distM: best.d, walkMin: best.w, busMin: best.s.eta, stopCount: best.n,
      getOffAt: run.departMin + best.s.eta, arriveAt, journeyMin: arriveAt - run.departMin, walkReal: false,
    })
  }
  return sortResults(res, pri)
}

export function sortResults(res: Result[], pri: Priority): Result[] {
  const by = {
    stops: (r: Result) => (r.walkMin > 15 ? 1e6 : 0) + r.stopCount * 1000 + r.arriveAt,
    quick: (r: Result) => r.arriveAt,
    walk: (r: Result) => r.walkMin * 1000 + r.arriveAt,
  }[pri]
  return [...res].sort((a, b) => by(a) - by(b))
}

/** Swap the straight-line walk for a real walking route once we have it. */
export function withWalk(r: Result, w: { path: Pt[]; distM: number; min: number }): Result {
  const arriveAt = r.getOffAt + w.min
  return { ...r, distM: w.distM, walkMin: w.min, arriveAt, journeyMin: arriveAt - r.run.departMin, walkReal: true, walkPath: w.path }
}

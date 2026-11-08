import { dist } from './geo'
import type { Dataset, Mode, Pt, Result, Run, SortKey, StopOption } from '../types'

export const PALETTE = ['#1a56db', '#e65100', '#2e7d32', '#8e24aa', '#c2185b', '#00838f', '#6d4c41']
const BUS_FACTOR = 1.3 // school bus assumed this much slower than a car
const MAX_OFF = 250 // metres: a road stop must be this close to the drawn route
export const walkMinutes = (d: number) => (d * 1.3) / 80 // 80 m/min, +30% for streets

export function prepare(ds: Dataset): Run[] {
  return ds.runs.map((r, i) => {
    const g = r.route.g
    const cum = [0]
    for (let k = 1; k < g.length; k++) cum.push(cum[k - 1] + dist(g[k - 1], g[k]))
    const total = cum[cum.length - 1] || 1
    const [h, m] = (r.depart ?? '15:05').split(':').map(Number)
    return {
      ...r,
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

export function planTrips(runs: Run[], dest: Pt, mode: Mode, sort: SortKey): Result[] {
  const res: Result[] = []
  for (const run of runs) {
    const stops = stopsFor(run)
    if (!stops.length) continue
    let best: { s: StopOption; d: number; w: number; key: number } | null = null
    for (const s of stops) {
      const d = dist([s.lat, s.lon], dest)
      const w = walkMinutes(d)
      const key = mode === 'close' ? d : s.eta + w
      if (!best || key < best.key) best = { s, d, w, key }
    }
    if (!best) continue
    const arriveAt = run.departMin + best.s.eta + best.w
    res.push({
      run, stop: best.s, stops, distM: best.d, walkMin: best.w, busMin: best.s.eta,
      getOffAt: run.departMin + best.s.eta, arriveAt, journeyMin: arriveAt - run.departMin,
    })
  }
  const by = { arrive: (r: Result) => r.arriveAt, walk: (r: Result) => r.walkMin, bus: (r: Result) => r.busMin }[sort]
  return res.sort((a, b) => by(a) - by(b))
}

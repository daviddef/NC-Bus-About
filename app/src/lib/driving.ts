import type { Pt } from '../types'

export interface Drive { path: Pt[]; distM: number; freeMin: number }
export const PICKUP_MIN = 5 // minutes to get through the school pick-up queue
/** Free-flow time from the router, scaled up for a typical school-afternoon peak. A rough guide, not live traffic. */
export const typicalMin = (d: Drive) => Math.max(3, Math.round(d.freeMin * 1.35))
export const rangeMin = (d: Drive): [number, number] => [Math.max(2, Math.round(d.freeMin * 1.1)), Math.round(d.freeMin * 1.7)]

const cache = new Map<string, Promise<Drive | null>>()

// OSRM's public demo server: fine for a prototype, replace with a licensed router before real use.
export function drivingRoute(from: Pt, to: Pt): Promise<Drive | null> {
  const key = [...from, ...to].map((v) => v.toFixed(5)).join(',')
  let p = cache.get(key)
  if (!p) {
    const u = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    p = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(u)
          if (r.ok) {
            const j = (await r.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] }
            const rt = j.routes?.[0]
            return rt ? { path: rt.geometry.coordinates.map((c): Pt => [c[1], c[0]]), distM: rt.distance, freeMin: rt.duration / 60 } : null
          }
        } catch { /* try again */ }
        await new Promise((go) => setTimeout(go, 700 * (attempt + 1)))
      }
      return null
    })().then((d) => { if (!d) cache.delete(key); return d })
    cache.set(key, p)
  }
  return p
}

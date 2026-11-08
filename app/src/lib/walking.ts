import type { Pt } from '../types'

export interface Walk { path: Pt[]; distM: number; min: number }

const cache = new Map<string, Promise<Walk | null>>()

// OpenStreetMap's public foot-routing server: fine for a prototype, replace with a licensed router before real use.
export function walkingRoute(from: Pt, to: Pt): Promise<Walk | null> {
  const key = [...from, ...to].map((v) => v.toFixed(5)).join(',')
  let p = cache.get(key)
  if (!p) {
    const u = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    p = fetch(u)
      .then((r) => r.json())
      .then((j: { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] }) => {
        const rt = j.routes?.[0]
        return rt ? { path: rt.geometry.coordinates.map((c): Pt => [c[1], c[0]]), distM: rt.distance, min: rt.duration / 60 } : null
      })
      .catch(() => null)
    cache.set(key, p)
  }
  return p
}

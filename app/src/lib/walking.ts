import type { Pt } from '../types'

export interface Walk { path: Pt[]; distM: number; min: number }

const cache = new Map<string, Promise<Walk | null>>()

// The public server rate-limits bursts: run at most two requests at once, retry failures, never cache a failure.
let active = 0
const queue: (() => void)[] = []
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((go) => queue.push(go))
  active++
  try { return await job() } finally { active--; queue.shift()?.() }
}

async function fetchWalk(u: string): Promise<Walk | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(u)
      if (r.ok) {
        const j = (await r.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] }
        const rt = j.routes?.[0]
        if (rt) return { path: rt.geometry.coordinates.map((c): Pt => [c[1], c[0]]), distM: rt.distance, min: rt.duration / 60 }
        return null // the server answered: there is no route
      }
    } catch { /* network hiccup: try again */ }
    await new Promise((go) => setTimeout(go, 700 * (attempt + 1)))
  }
  return null
}

// OpenStreetMap's public foot-routing server: fine for a prototype, replace with a licensed router before real use.
export function walkingRoute(from: Pt, to: Pt): Promise<Walk | null> {
  const key = [...from, ...to].map((v) => v.toFixed(5)).join(',')
  let p = cache.get(key)
  if (!p) {
    const u = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    p = slot(() => fetchWalk(u)).then((w) => { if (!w) cache.delete(key); return w })
    cache.set(key, p)
  }
  return p
}

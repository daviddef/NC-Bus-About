import type { IconName } from './icons'

export interface Place {
  lat: number
  lon: number
  label: string // short, shown big
  sub: string // suburb, city
  full: string
  icon: IconName
}

const BBOX = '152.3,-28.2,153.7,-26.6' // south-east Queensland
const BIAS = { lat: -27.38, lon: 153.05 } // Brisbane north side: favours places near the school

interface PhotonProps {
  name?: string; housenumber?: string; street?: string; district?: string; suburb?: string; locality?: string
  city?: string; county?: string; postcode?: string; osm_key?: string; osm_value?: string
}

function iconFor(p: PhotonProps): IconName {
  if (p.housenumber) return 'home'
  if (['school', 'college', 'university', 'kindergarten'].includes(p.osm_value ?? '')) return 'school'
  if (p.osm_key === 'railway' || p.osm_key === 'public_transport' || ['bus_station', 'bus_stop', 'station'].includes(p.osm_value ?? '')) return 'bus'
  return 'pin'
}

/** Type-ahead search. Photon (built for search-as-you-type), biased to Brisbane. Public demo server: fine for a prototype. */
export async function suggest(q: string, signal?: AbortSignal): Promise<Place[]> {
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${BIAS.lat}&lon=${BIAS.lon}&bbox=${BBOX}`
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`search service said ${r.status}`)
  const j: { features: { geometry: { coordinates: [number, number] }; properties: PhotonProps }[] } = await r.json()
  const seen = new Set<string>()
  const out: Place[] = []
  for (const f of j.features) {
    const p = f.properties
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const label = p.name ?? (street || p.suburb || p.district || p.city || '')
    if (!label) continue
    const sub = [...new Set([p.name ? street : '', p.suburb ?? p.district ?? p.locality, p.city, p.postcode].filter((x): x is string => !!x && x !== label))].join(', ')
    const key = `${label}|${sub}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label, sub, full: sub ? `${label}, ${sub}` : label, icon: iconFor(p) })
  }
  return out
}

// ---- recent searches (kept in this browser only)
const KEY = 'nc-bus-recent-v1'
const MAX = 6

export function loadRecents(): Place[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((p) => p && typeof p.lat === 'number' && typeof p.lon === 'number' && p.label) : []
  } catch { return [] }
}

export function saveRecents(list: Place[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch { /* private mode: skip */ }
}

export function addRecent(list: Place[], p: Place): Place[] {
  const next = [p, ...list.filter((x) => !(x.label === p.label && x.sub === p.sub))].slice(0, MAX)
  saveRecents(next)
  return next
}

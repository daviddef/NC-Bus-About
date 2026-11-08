import type { GeoHit } from '../types'

// Public OpenStreetMap search: fine for a prototype, replace with a licensed geocoder before real use.
export async function geocode(q: string): Promise<GeoHit[]> {
  const u = 'https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=au&viewbox=152.3,-28.2,153.7,-26.6&q=' + encodeURIComponent(q)
  const r = await fetch(u)
  if (!r.ok) throw new Error(`search service said ${r.status}`)
  const j: { lat: string; lon: string; display_name: string }[] = await r.json()
  return j.map((a) => ({
    lat: +a.lat,
    lon: +a.lon,
    label: a.display_name.split(',').slice(0, 2).join(','),
    full: a.display_name.split(',').slice(0, 3).join(','),
  }))
}

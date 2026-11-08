export function hhmm(totalMin: number): string {
  let m = Math.round(totalMin)
  const h = Math.floor(m / 60) % 24
  m = ((m % 60) + 60) % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`
}
export const mins = (m: number) => (m < 1 ? '<1 min' : `${Math.round(m)} min`)
export const metres = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`)

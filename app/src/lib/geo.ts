import type { Pt } from '../types'

const rad = (x: number) => (x * Math.PI) / 180

export function dist(a: Pt, b: Pt): number {
  const dl = rad(b[0] - a[0])
  const dn = rad(b[1] - a[1])
  const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dn / 2) ** 2
  return 12742000 * Math.asin(Math.sqrt(h))
}

export function bearing(a: Pt, b: Pt): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

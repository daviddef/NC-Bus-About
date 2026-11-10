import type { CmpItem } from '../components/Comparison'

export const SCHOOL_DAYS = 200 // about 40 school weeks a year
const hrs = (min: number) => min / 60
const fmtH = (h: number) => (h < 10 ? (Math.round(h * 10) / 10).toString() : Math.round(h).toString())
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Light-hearted numbers about the options that are ticked, worked out over a school year of about 200 days. */
export function factsFor(items: CmpItem[]): string[] {
  const out: string[] = []
  for (const it of items) {
    const isDrive = it.key === 'drive'
    if (isDrive) {
      const there = it.legs[0] ? it.legs[0].t1 - it.legs[0].t0 : 0
      const car = (there + it.rideMin) * SCHOOL_DAYS
      const queue = (it.legs.find((l) => l.kind === 'wait')?.t1 ?? 0) - (it.legs.find((l) => l.kind === 'wait')?.t0 ?? 0)
      out.push(`🚗 Parents in the car: about ${fmtH(hrs(car))} hours a year just doing school pick-up. That's ${Math.round(car / 110)} movies on the road.`)
      if (queue > 0) out.push(`⏳ Waiting in the pick-up line: ${fmtH(hrs(queue * SCHOOL_DAYS))} hours a year, ${Math.round((queue * SCHOOL_DAYS) / 3)} songs' worth of waiting for kids to find their bag.`)
      continue
    }
    const nm = it.short
    const ride = it.rideMin * SCHOOL_DAYS
    const mode = it.key.startsWith('pt:') ? (/Train/.test(it.name) ? 'on the train' : 'on the bus') : 'on the bus'
    if (ride > 0) out.push(`🚌 ${nm}: about ${fmtH(hrs(ride))} hours ${mode} this year. That's ${Math.round(ride / 110)} movies.`)
    if (it.waitMin > 0) out.push(`⏱️ ${nm}'s change costs ${fmtH(hrs(it.waitMin * SCHOOL_DAYS))} hours a year of standing at a stop. Bring a podcast.`)
    if (it.walkMin >= 1) {
      const km = (it.walkMin * SCHOOL_DAYS * 80) / 1000
      const steps = Math.round((it.walkMin * SCHOOL_DAYS * 110) / 1000) * 1000
      out.push(`👟 ${nm}: ${fmtH(hrs(it.walkMin * SCHOOL_DAYS))} hours of walking a year, about ${Math.round(km)} km and ${steps.toLocaleString('en-AU')} steps${km >= 42 ? `. That's ${(km / 42.2).toFixed(1)} marathons` : ''}.`)
    }
  }
  const real = items.filter((i) => i.key !== 'drive')
  if (real.length > 1) {
    const sorted = [...real].sort((a, b) => a.arriveAt - b.arriveAt)
    const a = sorted[0], b = sorted[sorted.length - 1]
    const gap = (b.arriveAt - a.arriveAt) * SCHOOL_DAYS
    if (gap >= 60) out.push(`🏁 ${a.short} beats ${b.short} by ${fmtH(hrs(gap))} hours over a year. Over Years 7–12 that's ${fmtH((hrs(gap) * 6) / 24)} whole days of your life back.`)
  }
  const d = items.find((i) => i.key === 'drive')
  if (d && real.length) {
    const b = [...real].sort((x, y) => x.arriveAt - y.arriveAt)[0]
    const diff = b.arriveAt - d.arriveAt
    if (Math.abs(diff) >= 1) out.push(diff > 0 ? `🚗 Being driven gets you home ${plural(Math.round(diff), 'min')} before ${b.short}, but costs a parent about ${fmtH(hrs((d.legs[0] ? d.legs[0].t1 - d.legs[0].t0 : 0) * SCHOOL_DAYS + d.rideMin * SCHOOL_DAYS))} hours on the road a year.` : `🚌 ${b.short} gets you home ${plural(Math.round(-diff), 'min')} before a lift would, and saves a parent the drive.`)
  }
  return out
}

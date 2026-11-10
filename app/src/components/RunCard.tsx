import { useState } from 'react'
import { hhmm, metres, mins } from '../lib/format'
import { svg, type IconName } from '../lib/icons'
import { dist } from '../lib/geo'
import { walkMinutes } from '../lib/plan'
import type { Pt, Result } from '../types'

interface Props { r: Result; tags?: string[]; on: boolean; onToggle: () => void; dest: Pt | null }

const Ic = ({ n, s = 15 }: { n: IconName; s?: number }) => <span className="ic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Getting off earlier on the same bus can get you home sooner: the best earlier named stop, if it saves a few minutes. */
export interface Earlier { n: number; s: Result['stop']; walk: number; save: number }
export function earlierStop(r: Result, dest: Pt | null): Earlier | null {
  if (!dest) return null
  const named = r.stops.filter((s) => s.k === 'stop').sort((a, b) => a.i - b.i) // numbered as on the map
  let best: Earlier | null = null
  for (let idx = 0; idx < named.length; idx++) {
    const s = named[idx]
    if (s.eta >= r.stop.eta) continue
    const walk = walkMinutes(dist([s.lat, s.lon], dest))
    if (walk > 15) continue
    const save = r.arriveAt - (r.run.departMin + s.eta + walk)
    if (save >= 3 && (!best || save > best.save)) best = { n: idx + 1, s, walk, save }
  }
  return best
}

/** The three things that matter: when I get off, how many stops, how far I walk. Plus warnings only when there are any. */
function Summary({ r, open, onMore, dest }: { r: Result; open: boolean; onMore: () => void; dest: Pt | null }) {
  const tip = earlierStop(r, dest)
  const ap = r.walkReal ? '' : '≈'
  const oldYear = r.run.updated ? Number(r.run.updated.slice(-4)) : null
  const old = oldYear !== null && oldYear <= 2023
  return (
    <>
      <div className="pills">
        <span className="pill"><Ic n="bus" /> <b>{hhmm(r.getOffAt)}</b><i>·</i>{plural(r.stopCount, 'stop')}<i>·</i>{mins(r.busMin)}</span>
        <span className="pill"><Ic n="walk" /> <b>{ap}{mins(r.walkMin)}</b><i>·</i>{ap}{metres(r.distM)}</span>
      </div>
      <div className="stopl"><Ic n="pin" s={14} /><span>{r.stop.t}</span></div>
      {tip && (
        <div className="tip"><Ic n="bulb" s={15} /><span>Or get off earlier at <b>stop {tip.n}</b> ({hhmm(r.run.departMin + tip.s.eta)}): ≈{mins(tip.walk)} walk, home <b>{mins(Math.round(tip.save))} sooner</b>.<small>{tip.s.t}</small></span></div>
      )}
      <div className="flags">
        {r.walkMin > 15 && <span className="flag bad"><Ic n="warn" s={13} /> Part-way only</span>}
        {old && <span className="flag"><Ic n="clock" s={13} /> Sheet {oldYear}</span>}
        <button type="button" className="more" aria-expanded={open} onClick={onMore}>{open ? 'Less' : 'Details'} <span className={open ? 'flip' : ''}><Ic n="chevron" s={16} /></span></button>
      </div>
      {open && (
        <ul className="details">
          <li>Leaves school <b>{hhmm(r.run.departMin)}</b>, from the College bus bays</li>
          <li>{r.stop.k === 'seg' ? <>A stop on <b>{r.stop.road}</b>. The bus stops here only if asked, where safe.</> : 'A named stop on the run sheet.'}</li>
          {r.walkMin > 15 && <li><b>Gets you part-way:</b> {metres(r.distM)} still to go. Ask someone to pick you up, or plan the walk.</li>}
          <li>Times are estimated from road distance. The stop has not been checked by College Transport{r.stop.status === 'possible' ? ' (match uncertain)' : ''}. Stop count includes optional stops.</li>
          {r.run.updated && <li>Run sheet last updated {r.run.updated}.</li>}
        </ul>
      )}
    </>
  )
}

/** Compact card, used for the top results. */
export default function RunCard({ r, tags, on, onToggle, dest }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`card ${on ? 'on' : ''}`} style={{ ['--c' as string]: r.run.colour }}>
      <div className="chead">
        <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Show ${r.run.name} on the map`} />
        <div className="cname">
          <b>{r.run.name.split(' · ')[0]}</b>
          <span>{r.run.name.split(' · ')[1]}</span>
          {tags?.map((t) => <em className="best" key={t}>{t}</em>)}
        </div>
        <div className="arr"><b>{hhmm(r.arriveAt)}</b><small>you arrive</small></div>
      </div>
      <Summary r={r} open={open} onMore={() => setOpen(!open)} dest={dest} />
    </div>
  )
}

/** One line that expands to the same summary, used for the rest of the runs. */
export function RunRow({ r, on, onToggle, dest }: Omit<Props, 'tags'>) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`row ${on ? 'on' : ''}`} style={{ ['--c' as string]: r.run.colour }}>
      <div className="row1">
        <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Show ${r.run.name} on the map`} />
        <span className="sw" />
        <button type="button" className="rowbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="rname">{r.run.name}</span>
          <span className="rsum">{hhmm(r.arriveAt)} · {r.walkReal ? '' : '≈'}{mins(r.walkMin)} walk</span>
          <span className={`chev ${open ? 'flip' : ''}`}><Ic n="chevron" s={18} /></span>
        </button>
      </div>
      {open && <div className="rowbody"><Summary r={r} open={true} onMore={() => setOpen(false)} dest={dest} /></div>}
    </div>
  )
}

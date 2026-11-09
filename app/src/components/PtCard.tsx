import { useState } from 'react'
import { hhmm, metres, mins } from '../lib/format'
import { svg, type IconName } from '../lib/icons'
import type { Net, PtView } from '../lib/transit'

const Ic = ({ n, s = 15 }: { n: IconName; s?: number }) => <span className="ic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const modeName = (m: string) => (m === '2' ? 'Train' : m === '4' ? 'Ferry' : m === '0' ? 'Tram' : 'Bus')
const label = (r: { route: string; mode: string }) => (r.mode === '2' ? 'Train' : r.route)

/** A public transport option: the services to catch, the walking, and what time you arrive. */
export default function PtCard({ v, net, on, onToggle }: { v: PtView; net: Net; on: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const { j } = v
  const ap = v.first.real && v.last.real ? '' : '≈'
  const onlyOne = j.rides.length === 1 ? j.rides[0] : null
  const title = j.rides.map(label).join(' + ')
  return (
    <div className={`card ${on ? 'on' : ''}`} style={{ ['--c' as string]: v.colour }}>
      <div className="chead">
        <input type="checkbox" checked={on} onChange={onToggle} aria-label="Show this journey on the map" />
        <div className="cname">
          <b>{modeName(j.rides[0].mode)} {title}</b>
          {j.changes > 0 && <span>{plural(j.changes, 'change')}</span>}
          {j.tags.map((t) => <em className="best" key={t}>{t}</em>)}
        </div>
        <div className="arr"><b>{hhmm(v.arriveAt)}</b><small>you arrive</small></div>
      </div>
      <div className="pills">
        {j.rides.map((r) => (
          <span className="pill" key={r.trip + ':' + r.board}><Ic n={r.mode === '2' ? 'transit' : 'bus'} /> <b>{label(r)}</b> {hhmm(r.boardAt)} <i>→</i> {hhmm(r.alightAt)}<i>·</i>{plural(r.nStops, 'stop')}</span>
        ))}
        <span className="pill"><Ic n="walk" /> <b>{ap}{mins(v.walkMin)}</b></span>
      </div>
      <div className="stopl"><Ic n="pin" s={14} /><span>Get on: {net.stops[onlyOne ? onlyOne.board : j.rides[0].board].n}</span></div>
      <div className="flags">
        {v.tight && <span className="flag bad"><Ic n="warn" s={13} /> Tight: leave straight away</span>}
        <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'} <span className={open ? 'flip' : ''}><Ic n="chevron" s={16} /></span></button>
      </div>
      {open && (
        <ul className="details">
          <li>Leave school by <b>{hhmm(v.leaveBy)}</b> (public transport). Walk {v.first.real ? '' : '≈'}{mins(v.first.min)} ({metres(v.first.distM)}) to <b>{net.stops[j.start].n}</b>.</li>
          {j.rides.map((r, i) => (
            <li key={i}>{i > 0 ? 'Then ' : ''}{modeName(r.mode)} <b>{label(r)}</b> to {r.headsign || 'the end of the line'}: on at <b>{hhmm(r.boardAt)}</b> ({net.stops[r.board].n}), off at <b>{hhmm(r.alightAt)}</b> ({net.stops[r.alight].n}).</li>
          ))}
          {j.changeWalkMin > 0 && <li>Walk {mins(j.changeWalkMin)} between stops to change.</li>}
          <li>Then walk {v.last.real ? '' : '≈'}{mins(v.last.min)} ({metres(v.last.distM)}) from <b>{net.stops[j.endStop].n}</b>.</li>
          <li>Based on TransLink&rsquo;s timetable for a school-term weekday. Not live: check TransLink for today.</li>
        </ul>
      )}
    </div>
  )
}

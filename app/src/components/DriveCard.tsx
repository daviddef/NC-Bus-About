import { hhmm, metres, mins } from '../lib/format'
import { svg } from '../lib/icons'
import { PICKUP_MIN, rangeMin, typicalMin, type Drive } from '../lib/driving'

const Ic = ({ n, s = 15 }: { n: Parameters<typeof svg>[0]; s?: number }) => <span className="ic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />

/** Being driven home: a typical afternoon, not live traffic. */
export default function DriveCard({ d, there, leave, colour, on, onToggle }: { d: Drive; there: Drive | null; leave: number; colour: string; on: boolean; onToggle: () => void }) {
  const t = typicalMin(d), [lo, hi] = rangeMin(d)
  const tt = typicalMin(there ?? d)
  return (
    <div className={`card ${on ? 'on' : ''}`} style={{ ['--c' as string]: colour }}>
      <div className="chead">
        <input type="checkbox" checked={on} onChange={onToggle} aria-label="Show the drive on the map" />
        <div className="cname"><b>Drive</b><span>picked up</span><em className="best" style={{ background: '#475569' }}>Typical</em></div>
        <div className="arr"><b>{hhmm(leave + PICKUP_MIN + t)}</b><small>you arrive</small></div>
      </div>
      <div className="pills">
        <span className="pill"><Ic n="car" /> <b>≈{mins(t)}</b><i>·</i>{lo}–{hi} min range</span>
        <span className="pill"><Ic n="pin" /> {metres(d.distM)}</span>
      </div>
      <ol className="steps">
        <li><i className="sdot"><Ic n="car" s={14} /></i><div><b>Parent leaves home</b> <span className="t">{hhmm(leave - tt)}</span><small>drives to school, about {mins(tt)}</small></div></li>
        <li><i className="sdot"><Ic n="clock" s={14} /></i><div><b>At the school</b> <span className="t">{hhmm(leave)}</span><small>pick-up queue ≈{PICKUP_MIN} min</small></div></li>
        <li><i className="sdot home"><Ic n="pin" s={14} /></i><div><b>Home</b> <span className="t">{hhmm(leave + PICKUP_MIN + t)}</span><small>{mins(t)} drive back · parent on the road about {mins(tt + t)}</small></div></li>
      </ol>
    </div>
  )
}

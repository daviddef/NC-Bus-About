import { hhmm, metres, mins } from '../lib/format'
import { svg } from '../lib/icons'
import { PICKUP_MIN, rangeMin, typicalMin, type Drive } from '../lib/driving'

const Ic = ({ n, s = 15 }: { n: Parameters<typeof svg>[0]; s?: number }) => <span className="ic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />

/** Being driven home: a typical afternoon, not live traffic. */
export default function DriveCard({ d, leave, colour, on, onToggle }: { d: Drive; leave: number; colour: string; on: boolean; onToggle: () => void }) {
  const t = typicalMin(d), [lo, hi] = rangeMin(d)
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
      <div className="stopl"><Ic n="clock" s={14} /><span>Pick-up queue ≈{PICKUP_MIN} min. A parent&rsquo;s round trip is about {mins(2 * t)} on the road.</span></div>
    </div>
  )
}

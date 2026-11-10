import { Fragment, useState } from 'react'
import { hhmm, metres, mins, stepsFor } from '../lib/format'
import { svg, type IconName } from '../lib/icons'
import type { Net, PtView } from '../lib/transit'

const Ic = ({ n, s = 15 }: { n: IconName; s?: number }) => <span className="ic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const label = (r: { route: string; mode: string }) => (r.mode === '2' ? 'Train' : r.route)

/** A public transport option: the services to catch, the walking, and what time you arrive. */
export default function PtCard({ v, net, on, onToggle }: { v: PtView; net: Net; on: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const { j } = v
  const ap = v.first.real && v.last.real ? '' : '≈'
  const onlyOne = j.rides.length === 1 ? j.rides[0] : null
  const title = j.rides.map((r) => (r.mode === '2' ? 'Train' : `Bus ${r.route}`)).join(' + ')
  return (
    <div className={`card ${on ? 'on' : ''}`} style={{ ['--c' as string]: v.colour }}>
      <div className="chead">
        <input type="checkbox" checked={on} onChange={onToggle} aria-label="Show this journey on the map" />
        <div className="cname">
          <b>{title}</b>
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
        <>
        <ol className="steps">
          <li><i className="sdot"><Ic n="clock" s={14} /></i><div><b>Leave school</b> <span className="t">{hhmm(v.leaveBy)}</span></div></li>
          <li className="walk"><i className="sdot"><Ic n="walk" s={14} /></i><div>{v.first.real ? '' : '≈'}{mins(v.first.min)} · {metres(v.first.distM)} · {stepsFor(v.first.distM)}<small>to {net.stops[j.start].n}</small></div></li>
          {j.rides.map((r, i) => (
            <Fragment key={i}>
              {i > 0 && <li className="walk"><i className="sdot"><Ic n="clock" s={14} /></i><div>Change: in <b>{hhmm(j.rides[i - 1].alightAt)}</b>, next {label(r)} <b>{hhmm(r.boardAt)}</b><small>{j.changeWalkMin > 0 ? `${mins(j.changeWalkMin)} walk to ` : 'at '}{net.stops[r.board].n} · wait {mins(Math.max(0, Math.round(r.boardAt - j.rides[i - 1].alightAt - j.changeWalkMin / (j.rides.length - 1))))}</small></div></li>}
              <li className="ride"><i className="sdot"><Ic n={r.mode === '2' ? 'transit' : 'bus'} s={14} /></i>
                <div><b className="rt">{label(r)}</b> <span className="to">to {r.headsign || 'end of line'}</span>
                  <div className="onoff"><span className="t">{hhmm(r.boardAt)}</span> on <small>{net.stops[r.board].n}</small></div>
                  <div className="onoff"><span className="t">{hhmm(r.alightAt)}</span> off <small>{net.stops[r.alight].n} · {plural(r.nStops, 'stop')}</small></div>
                </div></li>
            </Fragment>
          ))}
          <li className="walk"><i className="sdot"><Ic n="walk" s={14} /></i><div>{v.last.real ? '' : '≈'}{mins(v.last.min)} · {metres(v.last.distM)} · {stepsFor(v.last.distM)}<small>from {net.stops[j.endStop].n}</small></div></li>
          <li><i className="sdot home"><Ic n="pin" s={14} /></i><div><b>Home</b> <span className="t">{hhmm(v.arriveAt)}</span></div></li>
        </ol>
        <div className="src">TransLink timetable · school-term weekday · not live</div>
        </>
      )}
    </div>
  )
}

import { hhmm, metres, mins } from '../lib/format'
import type { Result } from '../types'

interface Props { r: Result; rank: number; on: boolean; onToggle: () => void }

export default function RunCard({ r, rank, on, onToggle }: Props) {
  const { run, stop } = r
  return (
    <div className={`card ${on ? 'on' : ''}`} style={{ ['--c' as string]: run.colour }}>
      <h2>
        <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Show ${run.name} on the map`} />
        <span className="sw" />
        {run.name}
        {rank === 0 && <span className="chip ok">Best</span>}
      </h2>
      <div className="times">
        <span>Leave school</span><b>{hhmm(run.departMin)}</b>
        <span>Get off</span><b>{hhmm(r.getOffAt)} <small>({mins(r.busMin)} on the bus)</small></b>
        <span>Reach destination</span><b>{hhmm(r.arriveAt)} <small>({r.walkReal ? '' : '≈'}{mins(r.walkMin)} walk, {r.walkReal ? '' : '≈'}{metres(r.distM)})</small></b>
      </div>
      <div>
        {stop.k === 'seg' && <>Stop on <b>{stop.road}</b>: </>}
        <b>{stop.t}</b> <small>(TransLink stop)</small>
      </div>
      <div className="chips">
        <span className="chip warn">stop not yet checked</span>
        {stop.status === 'possible' && <span className="chip warn">match uncertain</span>}
        <span className="chip warn">times estimated</span>
        {run.updated && <span className={`chip ${/20(2[56])/.test(run.updated) ? 'ok' : 'warn'}`}>sheet updated {run.updated}</span>}
      </div>
      {r.walkMin > 15 && (
        <div className="banner">Gets you part-way only: {metres(r.distM)} still to go ({mins(r.walkMin)} walk). Ask someone to pick you up, or plan the walk.</div>
      )}
    </div>
  )
}

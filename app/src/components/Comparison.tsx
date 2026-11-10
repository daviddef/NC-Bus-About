import { hhmm, metres, mins } from '../lib/format'
import { SCHOOL_DAYS } from '../lib/facts'

/** One way home, school bus or public transport, in the same terms. */
export interface CmpItem {
  key: string; name: string; short: string; colour: string
  startMin: number; getOffAt: number; arriveAt: number
  rideMin: number; changes: number; waitMin: number; swaps: { arrive: number; next: number; wait: number; route: string }[]; legs: { t0: number; t1: number; kind: 'ride' | 'wait' | 'walk'; label: string }[]; stops: number; walkMin: number; walkReal: boolean; distM: number; where: string
}
type Result = CmpItem

export default function Comparison({ results }: { results: Result[] }) {
  if (results.length < 2) {
    return <div className="cmp"><p className="note">Tick two or more runs to compare them.</p></div>
  }
  const start = Math.min(...results.map((r) => r.startMin))
  const end = Math.max(...results.map((r) => r.arriveAt))
  const span = Math.max(end - start, 1)
  const pct = (m: number) => ((m - start) / span) * 100
  const pool = results.filter((r) => r.key !== 'drive').length ? results.filter((r) => r.key !== 'drive') : results // being driven is shown, but never crowds out the others
  const first = [...pool].sort((a, b) => a.arriveAt - b.arriveAt)[0]
  const fewest = [...pool].sort((a, b) => a.stops - b.stops || a.arriveAt - b.arriveAt)[0]
  const least = [...pool].sort((a, b) => a.walkMin - b.walkMin)[0]
  const name = (r: Result) => r.short
  const win = (r: Result, tag: Result) => (r === tag ? 'win' : '')
  const best = (f: (r: Result) => number) => pool.reduce((m, r) => (f(r) < f(m) ? r : m))

  const rows: { label: string; cell: (r: Result) => React.ReactNode; best?: Result }[] = [
    { label: 'You arrive', cell: (r) => hhmm(r.arriveAt), best: first },
    { label: 'Get off', cell: (r) => hhmm(r.getOffAt) },
    { label: 'Riding', cell: (r) => mins(r.rideMin), best: best((r) => r.rideMin) },
    { label: 'Changes', cell: (r) => (r.changes ? <>{r.swaps.map((x, i) => <span key={i} className="swap"><b>{hhmm(x.arrive)}</b> change<small>next {x.route} <b>{hhmm(x.next)}</b></small><small>wait {mins(x.wait)}</small></span>)}</> : 'None'), best: pool.reduce((m, r) => (r.changes + r.waitMin / 100 < m.changes + m.waitMin / 100 ? r : m)) },
    { label: 'Stops', cell: (r) => r.stops, best: fewest },
    { label: 'Walk', cell: (r) => <>{r.walkReal ? '' : '≈'}{mins(r.walkMin)}<small>{metres(r.distM)}</small></>, best: least },
    { label: 'Get-off stop', cell: (r) => <small className="stopn">{r.where}</small> },
  ]

  const yr = (min: number) => (min * SCHOOL_DAYS) / 60 // hours over the year
  const h = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + ' h'
  const wait = (r: Result) => r.waitMin + (r.key === 'drive' ? r.legs.filter((l) => l.kind === 'wait').reduce((n, l) => n + l.t1 - l.t0, 0) : 0)
  const latest = Math.max(...pool.map((r) => r.arriveAt))
  const parent = (r: Result) => (r.key === 'drive' && r.legs[0] ? r.legs[0].t1 - r.legs[0].t0 + r.rideMin : 0)
  const yrRows: { label: string; cell: (r: Result) => React.ReactNode; best?: Result }[] = [
    { label: 'In the vehicle', cell: (r) => <>{h(yr(r.rideMin))}<small>{Math.round((r.rideMin * SCHOOL_DAYS) / 110)} movies</small></>, best: best((r) => r.rideMin) },
    { label: 'Waiting', cell: (r) => (wait(r) ? <>{h(yr(wait(r)))}<small>{r.key === 'drive' ? 'pick-up line' : 'at a stop'}</small></> : '0 h'), best: best((r) => wait(r)) },
    { label: 'Walking', cell: (r) => (r.walkMin >= 1 ? <>{h(yr(r.walkMin))}<small>{Math.round((r.walkMin * SCHOOL_DAYS * 80) / 1000)} km · {(Math.round((r.walkMin * SCHOOL_DAYS * 110) / 1000)).toLocaleString('en-AU')}k steps</small></> : '0 h'), best: best((r) => r.walkMin) },
    { label: 'Home sooner', cell: (r) => (r.arriveAt >= latest ? 'slowest' : <>+{h(yr(latest - r.arriveAt))}<small>{((yr(latest - r.arriveAt) * 6) / 24).toFixed(1)} days over Years 7–12</small></>), best: first },
    ...(results.some((r) => parent(r)) ? [{ label: 'Parent driving', cell: (r: Result) => (parent(r) ? <>{h(yr(parent(r)))}<small>there and back</small></> : '–') }] : []),
  ]

  return (
    <div className="cmp">
      <div className="picks">
        <div><span>Quickest</span><b style={{ color: first.colour }}>{name(first)}</b></div>
        <div><span>Fewest stops</span><b style={{ color: fewest.colour }}>{name(fewest)}</b></div>
        <div><span>Least walking</span><b style={{ color: least.colour }}>{name(least)}</b></div>
      </div>

      <div className="tl" role="img" aria-label="Timeline of each journey: ride then walk">
        {results.map((r) => {
          return (
            <div className="tlrow" key={r.key}>
              <div className="tlname" style={{ color: r.colour }}>{name(r)}</div>
              <div className="tlbar">
                {r.legs.map((l, i) => (
                  <div key={i} className={l.kind === 'ride' ? 'bus' : l.kind === 'walk' ? 'walk' : 'wait'}
                    style={{ left: pct(l.t0) + '%', width: Math.max(pct(l.t1) - pct(l.t0), 0) + '%', ...(l.kind === 'ride' ? { background: r.colour } : {}) }}>{pct(l.t1) - pct(l.t0) > (l.kind === 'wait' ? 16 : 12) ? l.label : ''}</div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="tlaxis"><span>{hhmm(start)}</span><span>{hhmm(start + span / 2)}</span><span>{hhmm(end)}</span></div>
      </div>

      <table className="simple">
        <thead>
          <tr><th />{results.map((r) => <th key={r.key} style={{ borderBottomColor: r.colour }}>{r.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {results.map((r) => <td key={r.key} className={row.best ? win(r, row.best) : ''}>{row.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="yrh">Over a school year</h3>
      <table className="simple yr">
        <thead>
          <tr><th />{results.map((r) => <th key={r.key} style={{ borderBottomColor: r.colour }}>{r.short}</th>)}</tr>
        </thead>
        <tbody>
          {yrRows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {results.map((r) => <td key={r.key} className={row.best === r ? 'win' : ''}>{row.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">About {SCHOOL_DAYS} school days, afternoon trip home only, from these estimated times. A movie is about 110 minutes; a marathon is 42 km.</p>
      <p className="note">Green is the best in each row. ≈ means the walk is a straight-line guess. Times are estimates, not checked by College Transport.</p>
    </div>
  )
}

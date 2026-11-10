import { hhmm, metres, mins } from '../lib/format'

/** One way home, school bus or public transport, in the same terms. */
export interface CmpItem {
  key: string; name: string; short: string; colour: string
  startMin: number; getOffAt: number; arriveAt: number
  rideMin: number; changes: number; waitMin: number; legs: { t0: number; t1: number; kind: 'ride' | 'wait' | 'walk'; label: string }[]; stops: number; walkMin: number; walkReal: boolean; distM: number; where: string
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
  const first = [...results].sort((a, b) => a.arriveAt - b.arriveAt)[0]
  const fewest = [...results].sort((a, b) => a.stops - b.stops || a.arriveAt - b.arriveAt)[0]
  const least = [...results].sort((a, b) => a.walkMin - b.walkMin)[0]
  const name = (r: Result) => r.short
  const win = (r: Result, tag: Result) => (r === tag ? 'win' : '')
  const best = (f: (r: Result) => number) => results.reduce((m, r) => (f(r) < f(m) ? r : m))

  const rows: { label: string; cell: (r: Result) => React.ReactNode; best?: Result }[] = [
    { label: 'You arrive', cell: (r) => hhmm(r.arriveAt), best: first },
    { label: 'Get off', cell: (r) => hhmm(r.getOffAt) },
    { label: 'Riding', cell: (r) => mins(r.rideMin), best: best((r) => r.rideMin) },
    { label: 'Changes', cell: (r) => (r.changes ? <>{r.changes}<small>wait {mins(r.waitMin)}</small></> : 'None'), best: results.reduce((m, r) => (r.changes + r.waitMin / 100 < m.changes + m.waitMin / 100 ? r : m)) },
    { label: 'Stops', cell: (r) => r.stops, best: fewest },
    { label: 'Walk', cell: (r) => <>{r.walkReal ? '' : '≈'}{mins(r.walkMin)}<small>{metres(r.distM)}</small></>, best: least },
    { label: 'Get-off stop', cell: (r) => <small className="stopn">{r.where}</small> },
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
                    style={{ left: pct(l.t0) + '%', width: Math.max(pct(l.t1) - pct(l.t0), 0) + '%', ...(l.kind === 'ride' ? { background: r.colour } : {}) }}>{pct(l.t1) - pct(l.t0) > (l.kind === 'wait' ? 7 : 12) ? l.label : ''}</div>
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
      <p className="note">Green is the best in each row. ≈ means the walk is a straight-line guess. Times are estimates, not checked by College Transport.</p>
    </div>
  )
}

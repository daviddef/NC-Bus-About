import { hhmm, metres, mins } from '../lib/format'
import type { Result } from '../types'

export default function Comparison({ results }: { results: Result[] }) {
  if (results.length < 2) {
    return <div className="cmp"><p className="note">Tick two or more runs to compare them.</p></div>
  }
  const start = Math.min(...results.map((r) => r.run.departMin))
  const end = Math.max(...results.map((r) => r.arriveAt))
  const span = Math.max(end - start, 1)
  const pct = (m: number) => ((m - start) / span) * 100
  const first = [...results].sort((a, b) => a.arriveAt - b.arriveAt)[0]
  const fewest = [...results].sort((a, b) => a.stopCount - b.stopCount || a.arriveAt - b.arriveAt)[0]
  const least = [...results].sort((a, b) => a.walkMin - b.walkMin)[0]
  const name = (r: Result) => r.run.name.split(' · ')[0]
  const win = (r: Result, tag: Result) => (r === tag ? 'win' : '')
  const best = (f: (r: Result) => number) => results.reduce((m, r) => (f(r) < f(m) ? r : m))

  const rows: { label: string; cell: (r: Result) => React.ReactNode; best?: Result }[] = [
    { label: 'You arrive', cell: (r) => hhmm(r.arriveAt), best: first },
    { label: 'Get off at', cell: (r) => hhmm(r.getOffAt) },
    { label: 'On the bus', cell: (r) => mins(r.busMin), best: best((r) => r.busMin) },
    { label: 'Stops', cell: (r) => r.stopCount, best: fewest },
    { label: 'Walk', cell: (r) => <>{r.walkReal ? '' : '≈'}{mins(r.walkMin)}<small>{metres(r.distM)}</small></>, best: least },
    { label: 'Get-off stop', cell: (r) => <small className="stopn">{r.stop.t}</small> },
  ]

  return (
    <div className="cmp">
      <div className="picks">
        <div><span>Quickest</span><b style={{ color: first.run.colour }}>{name(first)}</b></div>
        <div><span>Fewest stops</span><b style={{ color: fewest.run.colour }}>{name(fewest)}</b></div>
        <div><span>Least walking</span><b style={{ color: least.run.colour }}>{name(least)}</b></div>
      </div>

      <div className="tl" role="img" aria-label="Timeline of each journey: bus then walk">
        {results.map((r) => {
          const wlabel = r.distM < 150 ? 'no walk' : mins(r.walkMin) + ' walk'
          const narrow = pct(r.arriveAt) - pct(r.getOffAt) < 16 // too short to hold its own label
          return (
            <div className="tlrow" key={r.run.key}>
              <div className="tlname" style={{ color: r.run.colour }}>{name(r)}</div>
              <div className="tlbar">
                <div className="bus" style={{ left: pct(r.run.departMin) + '%', width: pct(r.getOffAt) - pct(r.run.departMin) + '%', background: r.run.colour }}>{mins(r.busMin)} bus{narrow ? ' · ' + wlabel : ''}</div>
                <div className="walk" style={{ left: pct(r.getOffAt) + '%', width: pct(r.arriveAt) - pct(r.getOffAt) + '%' }}>{narrow ? '' : wlabel}</div>
              </div>
            </div>
          )
        })}
        <div className="tlaxis"><span>{hhmm(start)}</span><span>{hhmm(start + span / 2)}</span><span>{hhmm(end)}</span></div>
      </div>

      <table className="simple">
        <thead>
          <tr><th />{results.map((r) => <th key={r.run.key} style={{ borderBottomColor: r.run.colour }}>{r.run.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {results.map((r) => <td key={r.run.key} className={row.best ? win(r, row.best) : ''}>{row.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Green is the best in each row. ≈ means the walk is a straight-line guess. Times are estimates, not checked by College Transport.</p>
    </div>
  )
}

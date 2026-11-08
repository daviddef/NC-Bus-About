import { hhmm, metres, mins } from '../lib/format'
import type { Result } from '../types'

type Row = { label: string; cells: (r: Result) => string; value?: (r: Result) => number }

const ROWS: Row[] = [
  { label: 'Arrive at destination', cells: (r) => hhmm(r.arriveAt), value: (r) => r.arriveAt },
  { label: 'Door to door (from leaving school)', cells: (r) => mins(r.journeyMin), value: (r) => r.journeyMin },
  { label: 'Leave school', cells: (r) => hhmm(r.run.departMin), value: (r) => r.run.departMin },
  { label: 'Get off at', cells: (r) => hhmm(r.getOffAt) },
  { label: 'Time on the bus', cells: (r) => mins(r.busMin), value: (r) => r.busMin },
  { label: 'Stops on the way', cells: (r) => String(r.stopCount), value: (r) => r.stopCount },
  { label: 'Walk at the end', cells: (r) => mins(r.walkMin), value: (r) => r.walkMin },
  { label: 'Walking distance', cells: (r) => metres(r.distM), value: (r) => r.distM },
]

export default function Comparison({ results }: { results: Result[] }) {
  if (results.length < 2) {
    return <div className="cmp"><p className="note">Tick two or more runs to compare them.</p></div>
  }
  const start = Math.min(...results.map((r) => r.run.departMin))
  const end = Math.max(...results.map((r) => r.arriveAt))
  const span = Math.max(end - start, 1)
  const pct = (m: number) => ((m - start) / span) * 100
  const first = [...results].sort((a, b) => a.arriveAt - b.arriveAt)[0]
  const least = [...results].sort((a, b) => a.walkMin - b.walkMin)[0]
  const fewest = [...results].sort((a, b) => a.stopCount - b.stopCount || a.arriveAt - b.arriveAt)[0]

  const notes = results.filter((r) => r !== first).map((r) => {
    const later = Math.round(r.arriveAt - first.arriveAt)
    const walkDiff = Math.round(r.walkMin - first.walkMin)
    const bits = [
      later === 0 ? 'arrives at the same time' : `arrives ${later} min later`,
      walkDiff === 0 ? '' : walkDiff < 0 ? `${-walkDiff} min less walking` : `${walkDiff} min more walking`,
    ].filter(Boolean)
    return <li key={r.run.key}><b style={{ color: r.run.colour }}>{r.run.name}</b>: {bits.join(', ')}.</li>
  })

  return (
    <div className="cmp">
      <h2>Comparing {results.length} runs</h2>
      <p className="verdict">
        <b style={{ color: fewest.run.colour }}>{fewest.run.name}</b> has the fewest stops ({fewest.stopCount}).{' '}
        <b style={{ color: first.run.colour }}>{first.run.name}</b> gets you there first, about <b>{hhmm(first.arriveAt)}</b>.{' '}
        <b style={{ color: least.run.colour }}>{least.run.name}</b> has the shortest walk ({mins(least.walkMin)}, {metres(least.distM)}).
        {' '}Compared with the quickest:
      </p>
      <ul>{notes}</ul>

      <h3>Timeline</h3>
      <div className="tl" role="img" aria-label="Timeline of each journey: bus then walk">
        {results.map((r) => {
          const wlabel = r.distM < 150 ? 'no walk' : mins(r.walkMin) + ' walk'
          const narrow = pct(r.arriveAt) - pct(r.getOffAt) < 16 // too short to hold its own label
          return (
            <div className="tlrow" key={r.run.key}>
              <div className="tlname" style={{ color: r.run.colour }}>{r.run.name.split(' · ')[0]}</div>
              <div className="tlbar">
                <div className="bus" style={{ left: pct(r.run.departMin) + '%', width: pct(r.getOffAt) - pct(r.run.departMin) + '%', background: r.run.colour }}>{mins(r.busMin)} bus{narrow ? ' · ' + wlabel : ''}</div>
                <div className="walk" style={{ left: pct(r.getOffAt) + '%', width: pct(r.arriveAt) - pct(r.getOffAt) + '%' }}>{narrow ? '' : wlabel}</div>
              </div>
            </div>
          )
        })}
        <div className="tlaxis"><span>{hhmm(start)}</span><span>{hhmm(start + span / 2)}</span><span>{hhmm(end)}</span></div>
      </div>

      <table>
        <thead>
          <tr><th />{results.map((r) => <th key={r.run.key} style={{ borderBottomColor: r.run.colour }}>{r.run.name}</th>)}</tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const best = row.value ? Math.min(...results.map(row.value)) : null
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {results.map((r) => <td key={r.run.key} className={row.value && row.value(r) === best ? 'win' : ''}>{row.cells(r)}</td>)}
              </tr>
            )
          })}
          <tr><th scope="row">Get-off stop</th>{results.map((r) => <td key={r.run.key}>{r.stop.k === 'seg' ? <>on {r.stop.road}: </> : null}{r.stop.t}</td>)}</tr>
          <tr><th scope="row">Walk measured by</th>{results.map((r) => <td key={r.run.key}>{r.walkReal ? 'walking route' : 'straight line (estimate)'}</td>)}</tr>
          <tr><th scope="row">Part-way only?</th>{results.map((r) => <td key={r.run.key} className={r.walkMin > 15 ? 'bad' : 'win'}>{r.walkMin > 15 ? 'Yes: long walk or pick-up' : 'No'}</td>)}</tr>
          <tr><th scope="row">Source sheet updated</th>{results.map((r) => <td key={r.run.key}>{r.run.updated ?? 'unknown'}</td>)}</tr>
          <tr><th scope="row">How sure are we?</th>{results.map((r) => <td key={r.run.key}>{r.stop.status === 'possible' ? 'Stop match uncertain; ' : ''}stop unchecked, times estimated</td>)}</tr>
        </tbody>
      </table>

      <p className="note">Green marks the best value in each row. All times are estimated from road distance (the College sheets only give the afternoon departure) and have not been checked by College Transport.</p>
    </div>
  )
}

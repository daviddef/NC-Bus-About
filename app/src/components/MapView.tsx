import { Fragment, useEffect, useState, type ReactNode } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { bearing, dist } from '../lib/geo'
import { hhmm, metres, mins } from '../lib/format'
import { svg, type IconName } from '../lib/icons'
import { etaMin, project } from '../lib/plan'
import type { Pt, Result } from '../types'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/'

function Resize({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) setTimeout(() => map.invalidateSize(), 0)
  }, [visible, map])
  return null
}

function FitTo({ bounds, fitKey }: { bounds: Pt[]; fitKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [56, 56] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}

// ---- marker icons
const schoolIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div class="pulse"><span class="ring"></span><span class="ring r2"></span><span class="core">${svg('school', 13)}</span></div><div class="mlabel school-l">Nudgee College</div>`,
})
const destIcon = L.divIcon({
  className: '',
  iconSize: [34, 40],
  iconAnchor: [17, 38],
  html: `<div class="dpin">${svg('pin', 34)}</div><div class="mlabel dest-l">Destination</div>`,
})
const offIcon = (colour: string, time: string) =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="off" style="--c:${colour}"><span class="offic">${svg('bus', 17)}</span><span class="offt">${time}</span></div>`,
  })
const numIcon = (n: number, colour: string) =>
  L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="num" style="background:${colour}">${n}</div>` })
const arrowIcon = (deg: number, colour: string) =>
  L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<svg width="18" height="18" viewBox="0 0 16 16" style="transform:rotate(${deg}deg)"><path d="M8 1 L14 14 L8 10.5 L2 14Z" fill="${colour}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  })

function arrows(line: Pt[]): { at: Pt; deg: number }[] {
  const out: { at: Pt; deg: number }[] = []
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i])
    if (acc >= 600) { acc = 0; out.push({ at: line[i], deg: bearing(line[i - 1], line[i]) }) }
  }
  return out
}

// ---- popup content
function Pop({ icon, colour, title, sub, rows }: { icon: IconName; colour: string; title: string; sub?: string; rows?: ReactNode[] }) {
  return (
    <div className="pop">
      <div className="pophead">
        <span className="popic" style={{ background: colour }} dangerouslySetInnerHTML={{ __html: svg(icon, 16) }} />
        <div>
          <div className="poptitle">{title}</div>
          {sub && <div className="popsub">{sub}</div>}
        </div>
      </div>
      {rows && rows.length > 0 && <ul className="poprows">{rows.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  )
}

interface Props {
  school: Pt
  dest: Pt | null
  destName: string
  selected: Result[]
  fitKey: number
  visible: boolean
}

export default function MapView({ school, dest, destName, selected, fitKey, visible }: Props) {
  const [popup, setPopup] = useState<{ at: Pt; node: ReactNode } | null>(null)
  const open = (at: Pt, node: ReactNode) => setPopup({ at, node })
  const bounds: Pt[] = [school]
  if (dest) bounds.push(dest)
  selected.forEach((r) => {
    bounds.push([r.stop.lat, r.stop.lon])
    r.run.route.g.slice(0, r.stop.i + 1).forEach((p, i) => i % 12 === 0 && bounds.push(p))
  })

  return (
    <div className="mapbox">
      <MapContainer center={school} zoom={12} className="map" zoomControl>
        <TileLayer attribution="Tiles &copy; Esri" url={ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} />
        <TileLayer url={ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} pane="shadowPane" />
        <Resize visible={visible} />
        <FitTo bounds={bounds} fitKey={fitKey} />

        {selected.map((r) => {
          const { run, stop } = r
          const g = run.route.g
          const mine = g.slice(0, stop.i + 1)
          const rest = g.slice(stop.i)
          const here: Pt = [stop.lat, stop.lon]
          const named = r.stops.filter((s) => s.k === 'stop').sort((a, b) => a.i - b.i)
          return (
            <Fragment key={run.key}>
              <Polyline positions={rest} pathOptions={{ color: run.colour, weight: 3, opacity: 0.4, dashArray: '1 8', lineCap: 'round' }} interactive={false} />
              <Polyline positions={mine} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} interactive={false} />
              <Polyline positions={mine} pathOptions={{ color: run.colour, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
              <Polyline
                positions={g}
                pathOptions={{ color: run.colour, weight: 24, opacity: 0 }}
                eventHandlers={{
                  click: (e) => {
                    const p: Pt = [e.latlng.lat, e.latlng.lng]
                    const pr = project(run, p)
                    const t = run.departMin + etaMin(run, pr.i)
                    let nb: { s: (typeof r.stops)[number]; d: number } | null = null
                    for (const s of r.stops) {
                      const d = dist([s.lat, s.lon], p)
                      if (!nb || d < nb.d) nb = { s, d }
                    }
                    open(p, (
                      <Pop icon="bus" colour={run.colour} title={run.name} sub={`Bus is here about ${hhmm(t)}`}
                        rows={[`${mins(etaMin(run, pr.i))} after leaving school`, nb && nb.d <= 250 ? `Nearest stop: ${nb.s.t} (${metres(nb.d)})` : 'No listed stop within 250 m']} />
                    ))
                  },
                }}
              />
              {arrows(mine).map((a, i) => <Marker key={i} position={a.at} icon={arrowIcon(a.deg, run.colour)} interactive={false} keyboard={false} />)}
              {r.stops.filter((s) => s.k === 'seg' && s.i <= stop.i).map((s, i) => (
                <CircleMarker key={i} center={[s.lat, s.lon]} radius={4} pathOptions={{ color: run.colour, weight: 2, fillColor: '#fff', fillOpacity: 1 }}
                  eventHandlers={{ click: () => open([s.lat, s.lon], <Pop icon="stop" colour={run.colour} title={s.t} sub={`${run.name.split(' · ')[0]} · about ${hhmm(run.departMin + s.eta)}`} rows={s.road ? [`On ${s.road}`, 'Bus stops here only if asked, where safe'] : []} />) }} />
              ))}
              {named.map((s, i) => (
                <Marker key={'n' + i} position={[s.lat, s.lon]} icon={numIcon(i + 1, run.colour)}
                  eventHandlers={{ click: () => open([s.lat, s.lon], <Pop icon="stop" colour={run.colour} title={s.t} sub={`${run.name.split(' · ')[0]} · stop ${i + 1} · about ${hhmm(run.departMin + s.eta)}`} />) }} />
              ))}
              {dest && (
                <Polyline
                  positions={r.walkPath ? [here, ...r.walkPath, dest] : [here, dest]}
                  pathOptions={{ color: '#d6336c', weight: 4, dashArray: r.walkPath ? '1 8' : '6 8', lineCap: 'round' }}
                  eventHandlers={{
                    click: (e) => open([e.latlng.lat, e.latlng.lng], (
                      <Pop icon="walk" colour="#d6336c" title={`Walk ${r.walkReal ? '' : '≈'}${metres(r.distM)} · ${r.walkReal ? '' : '≈'}${mins(r.walkMin)}`} sub={r.walkReal ? 'Along the walking route' : 'Straight-line estimate'} />
                    )),
                  }}
                />
              )}
              <Marker position={here} icon={offIcon(run.colour, hhmm(r.getOffAt).replace(' ', ''))} zIndexOffset={800}
                eventHandlers={{
                  click: () => open(here, (
                    <Pop icon="bus" colour={run.colour} title={`Get off: ${stop.t}`} sub={run.name}
                      rows={[`${hhmm(r.getOffAt)} · ${mins(r.busMin)} on the bus · ${r.stopCount} stop${r.stopCount === 1 ? '' : 's'}`, `Then ${r.walkReal ? '' : '≈'}${mins(r.walkMin)} walk (${metres(r.distM)})`, stop.k === 'seg' ? `A stop on ${stop.road}` : 'Named stop on the run sheet']} />
                  )),
                }} />
            </Fragment>
          )
        })}

        {dest && (
          <Marker position={dest} icon={destIcon} zIndexOffset={900}
            eventHandlers={{ click: () => open(dest, <Pop icon="pin" colour="#d6336c" title="Destination" sub={destName} />) }} />
        )}
        <Marker position={school} icon={schoolIcon} zIndexOffset={1000}
          eventHandlers={{ click: () => open(school, <Pop icon="school" colour="#e11d2e" title="St Joseph’s Nudgee College" sub="Every afternoon run starts here" />) }} />

        {popup && (
          <Popup position={popup.at} className="ncpop" offset={[0, -6]} eventHandlers={{ remove: () => setPopup(null) }}>
            {popup.node}
          </Popup>
        )}
      </MapContainer>

      {selected.length > 0 && (
        <div className="legend" aria-label="Selected runs">
          {selected.map((r) => (
            <div className="lg" key={r.run.key} style={{ ['--c' as string]: r.run.colour }}>
              <span className="lgsw" />
              <b>{r.run.name.split(' · ')[0]}</b>
              <span>off {hhmm(r.getOffAt)}</span>
              <span className="lgwalk" dangerouslySetInnerHTML={{ __html: `${svg('walk', 13)} ${r.walkReal ? '' : '≈'}${mins(r.walkMin)}` }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

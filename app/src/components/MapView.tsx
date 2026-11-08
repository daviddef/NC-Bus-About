import { Fragment, useEffect, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { bearing, dist } from '../lib/geo'
import { hhmm, metres, mins } from '../lib/format'
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
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}

const arrowIcon = (deg: number, colour: string) =>
  L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(${deg}deg)"><path d="M8 1 L14 14 L8 10.5 L2 14Z" fill="${colour}" stroke="#fff" stroke-width="1.5"/></svg>`,
  })
const numIcon = (n: number, colour: string) =>
  L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: `<div class="num" style="background:${colour}">${n}</div>` })
const destIcon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="dest"></div>' })

function arrows(line: Pt[]): { at: Pt; deg: number }[] {
  const out: { at: Pt; deg: number }[] = []
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i])
    if (acc >= 500) { acc = 0; out.push({ at: line[i], deg: bearing(line[i - 1], line[i]) }) }
  }
  return out
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
  const [popup, setPopup] = useState<{ at: Pt; node: React.ReactNode } | null>(null)
  const bounds: Pt[] = [school]
  if (dest) bounds.push(dest)
  selected.forEach((r) => {
    bounds.push([r.stop.lat, r.stop.lon])
    r.run.route.g.slice(0, r.stop.i + 1).forEach((p, i) => i % 12 === 0 && bounds.push(p))
  })

  return (
    <MapContainer center={school} zoom={11} className="map" zoomControl>
      <TileLayer attribution="Tiles &copy; Esri" url={ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} />
      <TileLayer url={ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'} maxNativeZoom={16} maxZoom={19} pane="shadowPane" />
      <Resize visible={visible} />
      <FitTo bounds={bounds} fitKey={fitKey} />
      <CircleMarker center={school} radius={7} pathOptions={{ color: '#0b3d91', fillOpacity: 0.9 }}>
        <Tooltip>Nudgee College (start)</Tooltip>
      </CircleMarker>
      {dest && (
        <Marker position={dest} icon={destIcon}>
          <Tooltip permanent direction="right">Destination: {destName}</Tooltip>
        </Marker>
      )}
      {selected.map((r) => {
        const { run, stop } = r
        const g = run.route.g
        const mine = g.slice(0, stop.i + 1)
        const rest = g.slice(stop.i)
        const here: Pt = [stop.lat, stop.lon]
        const named = run.points.length ? r.stops.filter((s) => s.k === 'stop').sort((a, b) => a.i - b.i) : []
        return (
          <Fragment key={run.key}>
            <Polyline positions={rest} pathOptions={{ color: run.colour, weight: 3, opacity: 0.35, dashArray: '2 6' }} />
            <Polyline positions={mine} pathOptions={{ color: run.colour, weight: 5, opacity: 0.9 }} />
            <Polyline
              positions={g}
              pathOptions={{ color: run.colour, weight: 20, opacity: 0 }}
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
                  setPopup({
                    at: p,
                    node: (
                      <>
                        <b>{run.name}</b>
                        <br />Bus is here about <b>{hhmm(t)}</b> ({mins(etaMin(run, pr.i))} after leaving school)
                        <br />
                        {nb && nb.d <= 250 ? <>Nearest stop: <b>{nb.s.t}</b> ({metres(nb.d)}), about {hhmm(run.departMin + nb.s.eta)}</> : 'No listed stop within 250 m'}
                      </>
                    ),
                  })
                },
              }}
            />
            {arrows(mine).map((a, i) => <Marker key={i} position={a.at} icon={arrowIcon(a.deg, run.colour)} interactive={false} />)}
            {r.stops.filter((s) => s.k === 'seg' && s.i <= stop.i).map((s, i) => (
              <CircleMarker key={i} center={[s.lat, s.lon]} radius={3} pathOptions={{ color: run.colour, weight: 1, fillColor: '#fff', fillOpacity: 1 }}>
                <Tooltip>{s.t} · {hhmm(run.departMin + s.eta)}</Tooltip>
              </CircleMarker>
            ))}
            {named.map((s, i) => (
              <Marker key={'n' + i} position={[s.lat, s.lon]} icon={numIcon(i + 1, run.colour)}>
                <Tooltip>{i + 1}. {s.t} · about {hhmm(run.departMin + s.eta)}</Tooltip>
              </Marker>
            ))}
            <CircleMarker center={here} radius={9} pathOptions={{ color: run.colour, weight: 4, fillColor: '#fff', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {run.name.split(' · ')[0]} — get off: {stop.t} · {hhmm(r.getOffAt)}
              </Tooltip>
            </CircleMarker>
            {dest && (
              <Polyline
                positions={r.walkPath ? [here, ...r.walkPath, dest] : [here, dest]}
                pathOptions={{ color: '#b3261e', weight: r.walkPath ? 4 : 3, dashArray: r.walkPath ? '1 7' : '3 6', lineCap: 'round' }}
              >
                <Tooltip sticky>
                  Walk {r.walkReal ? '' : '≈'}{metres(r.distM)} · {r.walkReal ? '' : '≈'}{mins(r.walkMin)} {r.walkReal ? '(walking route)' : '(straight-line estimate)'}
                </Tooltip>
              </Polyline>
            )}
          </Fragment>
        )
      })}
      {popup && (
        <Popup position={popup.at} eventHandlers={{ remove: () => setPopup(null) }}>
          {popup.node}
        </Popup>
      )}
    </MapContainer>
  )
}

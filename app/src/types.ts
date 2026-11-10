export type Pt = [number, number] // [lat, lon]

export interface RawPoint {
  k: 'stop' | 'seg'
  id?: string
  segid?: string
  t: string
  road?: string
  lat: number
  lon: number
  status?: string
}

export interface RawRun {
  key: string
  name: string
  updated: string | null
  depart: string | null
  points: RawPoint[]
  route: { g: Pt[]; dur: number; dist: number; ok: boolean }
}

export interface Dataset {
  school: Pt
  runs: RawRun[]
}

export interface Run extends RawRun {
  colour: string
  cum: number[]
  total: number
  departMin: number
  secTotal: number
}

export interface StopOption extends RawPoint {
  i: number // index of nearest vertex on the route line
  off: number // metres from the route line
  eta: number // minutes after leaving school (estimate)
}

export interface Result {
  run: Run
  stop: StopOption
  stops: StopOption[]
  distM: number // straight line, stop to destination
  walkMin: number
  busMin: number
  stopCount: number // listed stops on the way, including the get-off stop (the bus may skip "as required" ones)
  getOffAt: number // minutes since midnight
  arriveAt: number
  journeyMin: number // leaving school to reaching the destination
  walkReal: boolean // true once distM/walkMin come from a real walking route
  walkPath?: Pt[]
}

export type Priority = 'stops' | 'quick' | 'walk'

/** Public transport around the school, from TransLink's open GTFS data (see scripts/export_pt_overlay.py). */
export interface PtOverlay {
  date: string
  window: string
  routes: { id: string; m: string; g: Pt[][]; h?: string[] }[]
  stops: { id: string; n: string; p: Pt; m: string; l: [string, string, number[]][] }[]
}

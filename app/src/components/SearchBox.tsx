import { useEffect, useRef, useState } from 'react'
import { svg } from '../lib/icons'
import { suggest, type Place } from '../lib/places'

interface Props {
  ready: boolean
  recents: Place[]
  onPick: (p: Place) => void
  onClearRecents: () => void
}

const Icon = ({ n, s = 18 }: { n: Parameters<typeof svg>[0]; s?: number }) => <span className="sic" dangerouslySetInnerHTML={{ __html: svg(n, s) }} />

export default function SearchBox({ ready, recents, onPick, onClearRecents }: Props) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const req = useRef(0)

  // type-ahead, 300 ms after the last key
  useEffect(() => {
    const q = text.trim()
    if (q.length < 3) { setItems([]); setBusy(false); return }
    const id = ++req.current
    const ctl = new AbortController()
    setBusy(true)
    const t = setTimeout(() => {
      suggest(q, ctl.signal)
        .then((r) => { if (id === req.current) { setItems(r); setActive(-1); setMsg(r.length ? '' : 'Nothing found. Try adding the suburb.') } })
        .catch((e: Error) => { if (e.name !== 'AbortError' && id === req.current) setMsg('Search is not available right now. Check your connection.') })
        .finally(() => { if (id === req.current) setBusy(false) })
    }, 300)
    return () => { clearTimeout(t); ctl.abort() }
  }, [text])

  useEffect(() => {
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [])

  function pick(p: Place) {
    setText(p.label); setOpen(false); setItems([]); setMsg('')
    onPick(p)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Enter') {
      e.preventDefault()
      const p = items[active >= 0 ? active : 0]
      if (p) pick(p)
      else if (text.trim().length >= 3) setMsg(busy ? 'Searching…' : 'Nothing found. Try adding the suburb.')
    }
  }

  function here() {
    if (!navigator.geolocation) { setMsg('This browser cannot share your location.'); return }
    setMsg('Finding you…')
    navigator.geolocation.getCurrentPosition(
      (pos) => pick({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'My location', sub: '', full: 'My location', icon: 'target' }),
      () => setMsg('Could not get your location. You can type an address instead.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const showList = open && (items.length > 0 || msg !== '' || busy)
  return (
    <div className="sbox" ref={box}>
      <div className="sfield">
        <Icon n="pin" s={20} />
        <input
          type="search" role="combobox" aria-expanded={showList} aria-controls="sresults" aria-autocomplete="list"
          value={text} disabled={!ready} enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder="Where to? Address, shop or suburb"
          onChange={(e) => { setText(e.target.value); setOpen(true); setMsg('') }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        {text && <button type="button" className="sbtn" aria-label="Clear" onClick={() => { setText(''); setItems([]); setMsg('') }}><Icon n="close" s={18} /></button>}
        <button type="button" className="sbtn here" aria-label="Use my location" title="Use my location" onClick={here}><Icon n="target" s={22} /></button>
      </div>

      {showList && (
        <ul className="slist" id="sresults" role="listbox">
          {items.map((p, i) => (
            <li key={p.label + p.sub} role="option" aria-selected={i === active} className={i === active ? 'act' : ''}
              onPointerDown={(e) => { e.preventDefault(); pick(p) }} onMouseEnter={() => setActive(i)}>
              <Icon n={p.icon} s={20} />
              <span className="stx"><b>{p.label}</b>{p.sub && <small>{p.sub}</small>}</span>
            </li>
          ))}
          {items.length === 0 && <li className="smsg">{busy ? 'Searching…' : msg}</li>}
        </ul>
      )}
      {!showList && msg && <p className="smsg2">{msg}</p>}

      {recents.length > 0 && (
        <div className="recents" aria-label="Recent searches">
          <span className="rlabel"><Icon n="history" s={14} /> Recent</span>
          <div className="rchips">
            {recents.map((p) => (
              <button key={p.label + p.sub} type="button" className="rchip" onClick={() => pick(p)} title={p.full}>{p.label}</button>
            ))}
          </div>
          <button type="button" className="rclear" onClick={onClearRecents} aria-label="Clear recent searches">Clear</button>
        </div>
      )}
    </div>
  )
}

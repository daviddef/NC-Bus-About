import { svg, type IconName } from '../lib/icons'

export interface Opt<T extends string> { value: T; label: string; icon: IconName }

interface Props<T extends string> {
  label: string
  value: T
  options: Opt<T>[]
  onChange: (v: T) => void
}

/** Icon toggle group: big tap targets, one choice at a time. */
export default function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div className="segc">
      <div className="seglabel">{label}</div>
      <div className="segrow" role="radiogroup" aria-label={label} style={{ ['--n' as string]: options.length }}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
            <span className="segic" dangerouslySetInnerHTML={{ __html: svg(o.icon, 20) }} />
            <span className="segtx">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

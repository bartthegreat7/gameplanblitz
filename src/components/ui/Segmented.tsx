interface Option<T extends string> {
  value: T
  label: string
}

/** Single-select chip group (radiogroup semantics, arrow-key friendly via native buttons). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="mb-3.5 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-w-24 flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${
            o.value === value ? 'border-ink bg-ink text-bg' : 'border-line bg-panel text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

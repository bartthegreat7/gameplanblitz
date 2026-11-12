import { f1 } from '../../lib/format'

/**
 * Floor-to-ceiling bar with the projection marked. Renders only the marker when the range is
 * unknown (no game history), never an invented range.
 */
export function RangeBar({
  proj,
  floor,
  ceiling,
  domainMax,
}: {
  proj: number
  floor: number | null
  ceiling: number | null
  /** shared scale so bars in a list are comparable */
  domainMax: number
}) {
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / Math.max(domainMax, 1)) * 100))}%`
  const known = floor !== null && ceiling !== null
  const label = known
    ? `Projected ${f1(proj)}, range ${f1(floor)} to ${f1(ceiling)}`
    : `Projected ${f1(proj)}, range unavailable`
  return (
    <div role="img" aria-label={label} className="min-w-0">
      <div className="bg-line relative h-2 rounded-full">
        {known && (
          <span
            className="bg-accent/35 absolute inset-y-0 rounded-full"
            style={{ left: at(floor), width: `calc(${at(ceiling)} - ${at(floor)})` }}
          />
        )}
        <span
          className="bg-accent absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]"
          style={{ left: at(proj) }}
        />
      </div>
      <div className="text-ink-3 mt-1 flex justify-between text-[11px]">
        <span>{known ? f1(floor) : '—'}</span>
        <span className="text-ink-2 font-bold">{f1(proj)}</span>
        <span>{known ? f1(ceiling) : '—'}</span>
      </div>
    </div>
  )
}

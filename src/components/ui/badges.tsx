import { Clock, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Confidence, Evidence } from '../../lib/evidence'
import { relTime } from '../../lib/format'

/** "Updated 2m ago", ticking; turns amber once the data is older than `staleAfterMin`. */
export function FreshnessBadge({
  updatedAt,
  label = 'Updated',
  staleAfterMin = 15,
}: {
  updatedAt: number | null
  label?: string
  staleAfterMin?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!updatedAt) return null
  const stale = now - updatedAt > staleAfterMin * 60_000
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        stale ? 'border-amber/40 text-amber' : 'border-line text-ink-2'
      }`}
    >
      <Clock size={13} aria-hidden />
      {label} {relTime(updatedAt, now)}
      {stale && <span className="sr-only"> (data may be stale)</span>}
    </span>
  )
}

const LEVEL = {
  high: { label: 'High', cls: 'border-good/40 bg-good/10 text-good' },
  medium: { label: 'Medium', cls: 'border-amber/40 bg-amber/10 text-amber' },
  low: { label: 'Low', cls: 'border-line bg-panel text-ink-2' },
} as const

/** Confidence from the documented rubric (see CONFIDENCE_RUBRIC); the notes explain the score. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const l = LEVEL[confidence.level]
  return (
    <span
      title={confidence.notes.join(' · ')}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${l.cls}`}
    >
      <ShieldCheck size={13} aria-hidden />
      <span className="sr-only">Confidence: </span>
      {l.label}
    </span>
  )
}

/** Distinguishes sourced facts from model output so users can tell them apart. */
export function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null
  return (
    <dl className="border-line bg-panel grid gap-2 rounded-xl border p-3 text-sm">
      {items.map((e) => (
        <div key={e.label}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-ink-2 font-semibold">{e.label}</dt>
            <dd className="font-bold">{e.value}</dd>
          </div>
          <div className="text-ink-3 text-xs">
            {e.source.startsWith('Model') ? (
              <span className="text-amber font-semibold">Model estimate · </span>
            ) : (
              <span className="text-good font-semibold">Sourced · </span>
            )}
            {e.source}
          </div>
        </div>
      ))}
    </dl>
  )
}

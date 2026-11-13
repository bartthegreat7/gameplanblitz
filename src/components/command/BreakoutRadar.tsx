import { BarChart3 } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { radarProfile } from '../../lib/analytics/command'
import type { Breakout, UsageBook } from '../../lib/analytics/opportunity'
import { f1 } from '../../lib/format'
import type { Model } from '../../lib/model'
import { CardLink } from '../dashboard/DashboardCard'
import { CARD } from '../dashboard/styles'
import { EmptyState, ListSkeleton, Skeleton } from '../ui/states'

const RadarChartView = lazy(() => import('./RadarChartView'))
const CANDIDATES = 4

/**
 * Breakout candidates on a radar of real opportunity: each spoke is the player's average over his
 * last 2 games, as a percentile among every player at his position. Pick a player to see his numbers.
 */
export function BreakoutRadar({
  m,
  list,
  book,
  projOf,
  loading,
  className = '',
}: {
  m: Model
  list: Breakout[]
  book: UsageBook
  projOf: (id: string) => number
  loading: boolean
  className?: string
}) {
  // free agents in this league first: those are the ones you can act on
  const candidates = useMemo(() => {
    const rostered = m.allRostered()
    return [...list.filter((b) => !rostered.has(b.id)), ...list.filter((b) => rostered.has(b.id))].slice(0, CANDIDATES)
  }, [list, m])
  const [picked, setPicked] = useState<string | null>(null)
  const b = candidates.find((c) => c.id === picked) ?? candidates[0]
  const profile = useMemo(() => (b ? radarProfile(book, m.pos, b.id) : null), [b, book, m])
  const trend = b
    ? ((b.recent.touches + b.recent.targets) / Math.max(0.1, b.earlier.touches + b.earlier.targets) - 1) * 100
    : 0

  return (
    <section aria-label="Breakout Radar" className={`${CARD} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-2 flex items-center gap-2.5">
        <BarChart3 size={22} aria-hidden className="text-accent shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight">Breakout Radar</h2>
        <CardLink to="/breakouts" className="shrink-0">
          View All
        </CardLink>
      </div>
      {loading && !b ? (
        <ListSkeleton rows={3} />
      ) : !b || !profile ? (
        <EmptyState>No player meets the breakout criteria right now.</EmptyState>
      ) : (
        <div className="grid gap-2">
          {candidates.length > 1 && (
            <div role="radiogroup" aria-label="Breakout candidates" className="flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === b.id}
                  onClick={() => setPicked(c.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors ${
                    c.id === b.id ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink-2 hover:text-ink'
                  }`}
                >
                  {m.shortName(c.id)}
                </button>
              ))}
            </div>
          )}
          <p className="text-ink-2 truncate text-xs">
            <Link to={`/players/${b.id}`} className="text-ink font-bold hover:underline">
              {m.name(b.id)}
            </Link>{' '}
            · {b.pos} {m.team(b.id) || 'FA'} · {f1(projOf(b.id))} proj ·{' '}
            <span className={trend >= 0 ? 'text-good font-bold' : 'text-bad font-bold'}>
              {`${trend >= 0 ? '+' : '−'}${Math.abs(Math.round(trend))}%`} usage
            </span>
          </p>
          <figure className="m-0">
            <Suspense fallback={<Skeleton className="h-[178px]" />}>
              <RadarChartView axes={profile.axes} name={m.name(b.id)} />
            </Suspense>
            <figcaption className="text-ink-3 text-center text-[11px]">
              Percentile vs {profile.peers} {profile.pos}s, last 2 games (Sleeper stats)
            </figcaption>
          </figure>
          <details className="border-line/60 bg-bg/40 rounded-lg border px-3 py-1.5 text-sm">
            <summary className="cursor-pointer text-xs font-bold">Player breakdown</summary>
            <table className="mt-2 w-full text-xs">
              <caption className="sr-only">Opportunity profile for {m.name(b.id)}</caption>
              <thead>
                <tr className="text-ink-3 text-left">
                  <th scope="col" className="font-semibold">Measure (last 2 games)</th>
                  <th scope="col" className="text-right font-semibold">Value</th>
                  <th scope="col" className="text-right font-semibold">Percentile</th>
                </tr>
              </thead>
              <tbody>
                {profile.axes.map((a) => (
                  <tr key={a.key} className="border-line/40 border-t">
                    <td className="py-1">{a.label}</td>
                    <td className="py-1 text-right font-bold tabular-nums">{a.display}</td>
                    <td className="py-1 text-right tabular-nums">{a.raw === null ? '—' : Math.round(a.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="text-ink-2 mt-2 grid list-disc gap-0.5 pl-5 text-xs">
              {b.signals.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  )
}

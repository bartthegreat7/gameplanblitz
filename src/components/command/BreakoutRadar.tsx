import { TrendingUp } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { radarProfile } from '../../lib/analytics/command'
import type { Breakout, UsageBook } from '../../lib/analytics/opportunity'
import { f1 } from '../../lib/format'
import type { Model } from '../../lib/model'
import { CardLink, DashboardCard } from '../dashboard/DashboardCard'
import { Ownership } from '../opportunity/parts'
import { PlayerAvatar } from '../ui/Avatar'
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
    <DashboardCard
      title="Breakout Radar"
      subtitle={profile ? `Opportunity vs other ${profile.pos}s · last 2 games` : 'Rising usage, before the points follow'}
      icon={TrendingUp}
      tone="good"
      className={className}
      aside={<CardLink to="/breakouts">View All</CardLink>}
    >
      {loading && !b ? (
        <ListSkeleton rows={3} />
      ) : !b || !profile ? (
        <EmptyState>No player meets the breakout criteria right now.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {candidates.length > 1 && (
            <div role="radiogroup" aria-label="Breakout candidates" className="flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === b.id}
                  onClick={() => setPicked(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                    c.id === b.id ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink-2 hover:text-ink'
                  }`}
                >
                  {m.shortName(c.id)}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <PlayerAvatar player={m.players[b.id]} className="size-12 shrink-0 text-sm" />
            <div className="min-w-0 flex-1">
              <Link to={`/players/${b.id}`} className="block truncate font-extrabold hover:underline">
                {m.name(b.id)}
              </Link>
              <div className="text-ink-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {b.pos} · {m.team(b.id) || 'FA'} <Ownership m={m} id={b.id} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold tabular-nums">{f1(projOf(b.id))}</div>
              <div className="text-ink-3 text-[11px]">Proj. pts</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-extrabold tabular-nums ${trend >= 0 ? 'text-good' : 'text-bad'}`}>
                {`${trend >= 0 ? '+' : '−'}${Math.abs(Math.round(trend))}%`}
              </div>
              <div className="text-ink-3 text-[11px]">Usage trend</div>
            </div>
          </div>
          <figure className="m-0">
            <Suspense fallback={<Skeleton className="h-[210px]" />}>
              <RadarChartView axes={profile.axes} name={m.name(b.id)} />
            </Suspense>
            <figcaption className="text-ink-3 text-center text-xs">
              Percentile among {profile.peers} {profile.pos}s with 2+ games (Sleeper weekly stats)
            </figcaption>
          </figure>
          <dl className="grid grid-cols-3 gap-1.5 text-center">
            {profile.axes.map((a) => (
              <div key={a.key} className="border-line/60 bg-bg/40 rounded-lg border px-1 py-1.5">
                <dt className="text-ink-3 truncate text-[11px] font-semibold">{a.label}</dt>
                <dd className="text-sm font-extrabold tabular-nums">{a.display}</dd>
              </div>
            ))}
          </dl>
          <details className="border-line/60 bg-bg/40 rounded-xl border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-bold">Player breakdown: percentiles and signals</summary>
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Opportunity profile for {m.name(b.id)}</caption>
              <thead>
                <tr className="text-ink-3 text-left text-xs">
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
    </DashboardCard>
  )
}

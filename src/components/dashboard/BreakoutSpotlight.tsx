import { Lightbulb, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Breakout, Usage } from '../../lib/analytics/opportunity'
import { f1 } from '../../lib/format'
import type { Model } from '../../lib/model'
import { Ownership } from '../opportunity/parts'
import { PlayerAvatar } from '../ui/Avatar'
import { EmptyState, ListSkeleton } from '../ui/states'
import { CardLink, DashboardCard } from './DashboardCard'

/** Touches + targets per game, as a small line (a data chart, drawn from the player's actual games). */
function Sparkline({ games }: { games: Usage[] }) {
  const v = games.map((g) => g.touches + g.targets)
  if (v.length < 2) return null
  const max = Math.max(...v, 1)
  const w = 120
  const h = 36
  const pts = v
    .map((y, i) => `${(i / (v.length - 1)) * w},${h - 3 - (y / max) * (h - 6)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="text-good h-9 w-28 shrink-0"
      role="img"
      aria-label={`Touches plus targets per game: ${v.join(', ')}`}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The top breakout candidate, featured; free agents in the league first. */
export function BreakoutSpotlight({
  m,
  list,
  games,
  projOf,
  loading,
  className = '',
}: {
  m: Model
  list: Breakout[]
  games: (id: string) => Usage[]
  projOf: (id: string) => number
  loading: boolean
  className?: string
}) {
  const rostered = m.allRostered()
  const b = list.find((x) => !rostered.has(x.id)) ?? list[0]
  const trend = b
    ? ((b.recent.touches + b.recent.targets) /
        Math.max(0.1, b.earlier.touches + b.earlier.targets) -
        1) *
      100
    : 0
  return (
    <DashboardCard
      title="Breakout Player Radar"
      subtitle="Rising usage, before the points follow"
      icon={TrendingUp}
      tone="good"
      className={className}
      aside={<CardLink to="/breakouts">View All</CardLink>}
    >
      {loading && !b ? (
        <ListSkeleton rows={3} />
      ) : !b ? (
        <EmptyState>No player meets the breakout criteria right now.</EmptyState>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="border-line/60 bg-bg/40 flex gap-4 rounded-xl border p-3">
            <PlayerAvatar
              player={m.players[b.id]}
              className="size-24 shrink-0 !rounded-xl text-2xl"
            />
            <div className="min-w-0 flex-1">
              <Link
                to={`/players/${b.id}`}
                className="block truncate text-lg font-extrabold hover:underline"
              >
                {m.name(b.id)}
              </Link>
              <div className="text-ink-2 text-sm font-semibold">
                {b.pos} · {m.team(b.id) || 'FA'}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="bg-good/15 text-good border-good/40 rounded-md border px-2 py-0.5 text-xs font-extrabold">
                  Breakout Candidate
                </span>
                <Ownership m={m} id={b.id} />
              </div>
              <div className="mt-2.5 flex gap-5">
                <div>
                  <div className="text-2xl font-extrabold tabular-nums">{f1(projOf(b.id))}</div>
                  <div className="text-ink-3 text-xs">Proj. pts</div>
                </div>
                <div>
                  <div
                    className={`text-2xl font-extrabold tabular-nums ${trend >= 0 ? 'text-good' : 'text-bad'}`}
                  >{`${trend >= 0 ? '+' : '−'}${Math.abs(Math.round(trend))}%`}</div>
                  <div className="text-ink-3 text-xs">Usage trend</div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-line/60 bg-bg/40 flex items-center gap-3 rounded-xl border p-3">
            <Lightbulb size={18} aria-hidden className="text-amber shrink-0" />
            <p className="text-ink-2 min-w-0 flex-1 text-sm">{b.signals[0]}.</p>
            <Sparkline games={games(b.id)} />
          </div>
          {list.length > 1 && (
            <p className="text-ink-3 text-xs">
              {list.length - 1} more candidate{list.length === 2 ? '' : 's'} on the radar. Usage
              trend = touches + targets per game, last 2 games vs earlier.
            </p>
          )}
        </div>
      )}
    </DashboardCard>
  )
}

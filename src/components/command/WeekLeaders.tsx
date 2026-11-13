import { Crown, Medal } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { leaderPositions, weekLeaders, type PlayerScore } from '../../lib/analytics/leaders'
import { f1 } from '../../lib/format'
import { useSession } from '../../hooks/useSession'
import type { Model } from '../../lib/model'
import type { SleeperMatchup } from '../../lib/sleeper'
import { CARD } from '../dashboard/styles'
import { WeekSelect } from '../layout/Menus'
import { PlayerAvatar, TeamAvatar } from '../ui/Avatar'
import { EmptyState } from '../ui/states'

const RUNNERS_UP = 2

function BenchTag({ p }: { p: PlayerScore }) {
  return p.started ? null : (
    <span className="border-amber/40 bg-amber/10 text-amber ml-1.5 rounded px-1 py-px align-middle text-[10px] font-extrabold uppercase">
      Bench
    </span>
  )
}

function PositionCard({ m, pos, players }: { m: Model; pos: string; players: PlayerScore[] }) {
  const [top, ...rest] = players
  const mine = (p: PlayerScore) => p.rosterId === m.myRosterId
  return (
    <section aria-label={`Top ${pos}`} className="border-line/70 bg-card-2/60 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-accent text-sm font-extrabold tracking-wider uppercase">{pos}</h3>
        <span className="text-ink-3 text-xs">{players.length} rostered</span>
      </div>
      <div className="flex items-center gap-3">
        <PlayerAvatar player={m.players[top.id]} className="size-14 shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <Link to={`/players/${top.id}`} className="block truncate text-[15px] font-extrabold hover:underline">
            {m.name(top.id)}
          </Link>
          <div className="text-ink-2 truncate text-xs">
            {m.team(top.id) || 'FA'} · {m.teamName(top.rosterId)}
            {mine(top) && <b className="text-accent"> (you)</b>}
            <BenchTag p={top} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-good text-2xl font-extrabold tabular-nums">{f1(top.points)}</div>
          <div className="text-ink-3 text-[11px]">pts</div>
        </div>
      </div>
      {rest.length > 0 && (
        <ol start={2} className="border-line/60 grid gap-1 border-t pt-2 text-sm">
          {rest.slice(0, RUNNERS_UP).map((p, i) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="text-ink-3 w-4 text-xs font-bold">{i + 2}</span>
              <span className="min-w-0 flex-1 truncate">
                <Link to={`/players/${p.id}`} className="font-semibold hover:underline">
                  {m.shortName(p.id)}
                </Link>
                <span className="text-ink-3 text-xs">
                  {' '}
                  · {m.teamName(p.rosterId)}
                  {mine(p) ? ' (you)' : ''}
                </span>
                <BenchTag p={p} />
              </span>
              <span className="font-bold tabular-nums">{f1(p.points)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * Who scored the most this week: every team ranked, and the top scorers at each position among
 * the players on this league's rosters (Sleeper's points in league scoring).
 */
export function WeekLeaders({
  m,
  matchups,
  week,
  note,
}: {
  m: Model
  matchups: SleeperMatchup[]
  week: number
  /** where the week stands, from the schedule: "Week complete", "Games underway", ... */
  note: string | null
}) {
  const l = useMemo(() => weekLeaders(matchups, m.pos), [matchups, m])
  const positions = leaderPositions(l.byPosition)
  const top = l.teams[0]
  const max = Math.max(1, top?.points ?? 1)
  const { currentWeek } = useSession()
  // a past week is over even if the schedule hasn't marked every game complete
  const final = note === 'Week complete' || week < currentWeek
  const status = final ? 'Final scores' : l.scored ? 'Live: points so far, games still to play' : 'No points scored yet'

  return (
    <section aria-label="Week leaders" className={`${CARD} grid gap-5 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <Medal size={26} aria-hidden className="text-amber shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Week {week} Leaders</h2>
          <p className={`text-sm ${final ? 'text-ink-2' : 'text-amber'}`}>
            {status} · Sleeper scores in your league&apos;s scoring
          </p>
        </div>
        <WeekSelect className="bg-card/80" />
      </div>

      {!l.scored || !top ? (
        <EmptyState>
          No points have been scored in Week {week} yet. Pick an earlier week to see its leaders.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <section
              aria-label="Top scoring team"
              className="border-amber/40 from-amber/15 flex flex-col items-center justify-center gap-2 rounded-xl border bg-gradient-to-b to-transparent p-5 text-center"
            >
              <span className="text-amber flex items-center gap-1.5 text-xs font-extrabold tracking-wider uppercase">
                <Crown size={16} aria-hidden /> Top scoring team
              </span>
              <TeamAvatar user={m.ownerOf(top.rosterId)} className="ring-amber/60 size-16 text-lg ring-2" />
              <div className="text-xl font-extrabold">
                {m.teamName(top.rosterId)}
                {top.rosterId === m.myRosterId && <span className="text-accent"> (you)</span>}
              </div>
              <div className="text-4xl font-extrabold tabular-nums">{f1(top.points)}</div>
              {top.oppPoints !== null && top.oppRosterId !== null && (
                <div className="text-ink-2 text-sm">
                  {top.points > top.oppPoints ? (final ? 'Beat' : 'Leading') : top.points < top.oppPoints ? (final ? 'Lost to' : 'Trailing') : 'Tied with'}{' '}
                  {m.teamName(top.oppRosterId)} {f1(top.points)}–{f1(top.oppPoints)}
                </div>
              )}
            </section>
            <section aria-label="Team scores">
              <h3 className="text-ink-3 mb-2 text-xs font-extrabold tracking-wider uppercase">Every team this week</h3>
              <ol className="grid gap-1.5">
                {l.teams.map((t, i) => {
                  const me = t.rosterId === m.myRosterId
                  return (
                    <li
                      key={t.rosterId}
                      aria-current={me ? 'true' : undefined}
                      className={`grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-lg px-2 py-1 text-sm ${me ? 'bg-active/60' : ''}`}
                    >
                      <span className="text-ink-3 text-xs font-bold">{i + 1}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        <TeamAvatar user={m.ownerOf(t.rosterId)} className="size-6 shrink-0 text-[10px]" />
                        <span className={`truncate ${me ? 'font-extrabold' : 'font-semibold'}`}>{m.teamName(t.rosterId)}</span>
                      </span>
                      <span aria-hidden className="bg-line/50 h-2 overflow-hidden rounded-full">
                        <span
                          className={`block h-full rounded-full ${i === 0 ? 'bg-amber' : me ? 'bg-accent' : 'bg-accent-deep/70'}`}
                          style={{ width: `${(Math.max(0, t.points) / max) * 100}%` }}
                        />
                      </span>
                      <span className="text-right font-extrabold tabular-nums">{f1(t.points)}</span>
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>

          <section aria-label="Top scorers by position">
            <h3 className="text-ink-3 mb-2 text-xs font-extrabold tracking-wider uppercase">
              Top scorers by position · players on your league&apos;s rosters
            </h3>
            {positions.length === 0 ? (
              <EmptyState>Sleeper hasn&apos;t reported player-by-player points for Week {week}.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 @[60rem]/main:grid-cols-3">
                {positions.map((p) => (
                  <PositionCard key={p} m={m} pos={p} players={l.byPosition.get(p)!} />
                ))}
              </div>
            )}
            <p className="text-ink-3 mt-3 text-xs">
              Bench = scored while not in that team&apos;s starting lineup, so those points didn&apos;t count.
              Free agents aren&apos;t included: Sleeper reports weekly points only for rostered players.
            </p>
          </section>
        </>
      )}
    </section>
  )
}

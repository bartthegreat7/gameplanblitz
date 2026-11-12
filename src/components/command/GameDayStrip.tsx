import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Ready } from '../../hooks/useLeagueData'
import { gameDate, gameStrip, type StripGame, type StripPlayer } from '../../lib/analytics/command'
import { IDLE_POLL_MS, liveSide, pollInterval, type LiveSide } from '../../lib/analytics/gameday'
import { weekContext } from '../../lib/analytics/schedule'
import { f1 } from '../../lib/format'
import { findMyMatchup, findOpponent } from '../../lib/insights'
import { getMatchups, getSchedule, type SleeperMatchup } from '../../lib/sleeper'
import { CardLink } from '../dashboard/DashboardCard'
import { CARD } from '../dashboard/styles'
import { EmptyState, Skeleton } from '../ui/states'

export function TeamLogo({ team, className = 'size-8' }: { team: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span aria-hidden className={`bg-panel text-ink-2 grid shrink-0 place-items-center rounded-full text-[10px] font-extrabold ${className}`}>
        {team}
      </span>
    )
  return (
    <img
      src={`https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}

const STATE = {
  live: { label: 'Live', cls: 'bg-bad/15 text-bad border-bad/40' },
  scheduled: { label: 'Scheduled', cls: 'bg-panel text-ink-2 border-line' },
  final: { label: 'Final', cls: 'bg-good/10 text-good border-good/30' },
} as const

const strip = (s: LiveSide | null, team: (id: string) => string): StripPlayer[] =>
  (s?.players ?? [])
    .filter((p) => p.id && p.id !== '0')
    .map((p) => ({ id: p.id, name: p.name, team: team(p.id), points: p.points, remaining: p.remaining, state: p.state }))

function Game({ g }: { g: StripGame }) {
  const st = STATE[g.state]
  const pts = (ps: StripPlayer[]) => ps.reduce((a, p) => a + p.points, 0)
  return (
    <li className="border-line/60 bg-card-2/60 flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${st.cls}`}>
          {g.state === 'live' && <span aria-hidden className="bg-bad size-1.5 animate-pulse rounded-full" />}
          {st.label}
        </span>
        <span className="text-ink-3">{gameDate(g.date)}</span>
      </div>
      <div className="flex items-center gap-2 font-extrabold">
        <TeamLogo team={g.away} />
        <span>{g.away}</span>
        <span className="text-ink-3 text-sm">@</span>
        <TeamLogo team={g.home} />
        <span>{g.home}</span>
      </div>
      <div className="text-ink-2 grid gap-0.5 text-xs">
        <span className="truncate">
          <b className="text-ink">You:</b> {g.mine.length ? g.mine.map((p) => p.name).join(', ') : 'none'}
          {g.state !== 'scheduled' && g.mine.length > 0 && ` · ${f1(pts(g.mine))} pts`}
        </span>
        <span className="truncate">
          <b className="text-ink">Opp:</b> {g.theirs.length ? g.theirs.map((p) => p.name).join(', ') : 'none'}
          {g.state !== 'scheduled' && g.theirs.length > 0 && ` · ${f1(pts(g.theirs))} pts`}
        </span>
      </div>
      <div className={`mt-auto text-xs font-bold ${g.net > 0.05 ? 'text-good' : g.net < -0.05 ? 'text-bad' : 'text-ink-3'}`}>
        {g.state === 'final'
          ? 'Game over'
          : Math.abs(g.net) < 0.05
            ? 'Even stakes'
            : `${g.net > 0 ? '+' : '−'}${f1(Math.abs(g.net))} proj. pts ${g.net > 0 ? 'for you' : 'for your opponent'}`}
      </div>
    </li>
  )
}

/**
 * This week's NFL games that matter to your matchup: who of yours and your opponent's plays in each,
 * game status (scheduled / live / final) and the projected points still at stake. Refreshes like
 * Game Day Live: every minute while games are on, every 5 minutes otherwise.
 */
export function GameDayStrip({ data, className = '' }: { data: Ready; className?: string }) {
  const { model: m, league, week, season } = data
  const scheduleQ = useQuery({
    queryKey: ['schedule', season],
    queryFn: () => getSchedule(season),
    staleTime: 60_000,
    refetchInterval: IDLE_POLL_MS,
    retry: 1,
  })
  const matchupsQ = useQuery({
    queryKey: ['matchups', league.league_id, week],
    queryFn: () => getMatchups(league.league_id, week),
    refetchInterval: (q) => pollInterval(q.state.data as SleeperMatchup[] | undefined, scheduleQ.data, week),
    refetchIntervalInBackground: false,
  })
  const matchups = matchupsQ.data ?? data.matchups
  const games = useMemo(() => {
    if (!scheduleQ.data) return null
    const ctx = weekContext(scheduleQ.data, week)
    const mine = findMyMatchup(matchups, m.myRosterId)
    const opp = findOpponent(matchups, m.myRosterId)
    return gameStrip(
      scheduleQ.data,
      week,
      strip(mine ? liveSide(m, mine, ctx) : null, m.team),
      strip(opp ? liveSide(m, opp, ctx) : null, m.team),
    )
  }, [scheduleQ.data, matchups, m, week])
  const live = games?.filter((g) => g.state === 'live').length ?? 0
  return (
    <section aria-label="Game Day Dashboard" className={`${CARD} min-w-0 p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="bg-bad/12 text-bad grid size-10 shrink-0 place-items-center rounded-xl">
          <Radio size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight">Game Day Dashboard</h2>
          <p className="text-ink-3 text-sm">
            {live
              ? `${live} game${live === 1 ? '' : 's'} live now`
              : `Week ${week} games with your starters or your opponent's`}{' '}
            · kickoff times aren't published by Sleeper
          </p>
        </div>
        <CardLink to="/gameday">Game Day Live</CardLink>
      </div>
      {!games ? (
        scheduleQ.isError ? (
          <EmptyState>The NFL schedule could not be loaded.</EmptyState>
        ) : (
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-64 shrink-0" />
            ))}
          </div>
        )
      ) : games.length === 0 ? (
        <EmptyState>No Week {week} games involve your matchup.</EmptyState>
      ) : (
        <ul
          aria-label={`Week ${week} games`}
          tabIndex={0}
          className="nav-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2"
        >
          {games.map((g) => (
            <Game key={g.id} g={g} />
          ))}
        </ul>
      )}
    </section>
  )
}

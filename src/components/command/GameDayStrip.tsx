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
import { Link } from 'react-router-dom'
import { CARD } from '../dashboard/styles'
import { Skeleton } from '../ui/states'

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
  const pts = (ps: StripPlayer[]) => ps.reduce((a, p) => a + p.points, 0)
  const names = (ps: StripPlayer[]) => (ps.length ? ps.map((p) => p.name).join(', ') : 'none')
  const status =
    g.state === 'live'
      ? `Live · ${f1(pts(g.mine))}–${f1(pts(g.theirs))}`
      : g.state === 'final'
        ? `Final · ${f1(pts(g.mine))}–${f1(pts(g.theirs))}`
        : gameDate(g.date)
  const impact =
    g.state === 'final' || Math.abs(g.net) < 0.05
      ? null
      : `${g.net > 0 ? '+' : '−'}${f1(Math.abs(g.net))} ${g.net > 0 ? 'you' : 'opp'}`
  return (
    <li
      title={`You: ${names(g.mine)} · Opponent: ${names(g.theirs)}`}
      className="border-line/60 flex shrink-0 snap-start items-center gap-3 border-l px-4 first:border-l-0"
    >
      <TeamLogo team={g.away} className="size-10" />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold whitespace-nowrap">
          {g.away} @ {g.home}
        </span>
        <span className="text-ink-2 block text-[13px] whitespace-nowrap">
          {g.state === 'live' && <span aria-hidden className="bg-bad mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle" />}
          {status}
          {impact && (
            <span className={`ml-1.5 font-bold ${g.net > 0 ? 'text-good' : 'text-bad'}`}>{impact}</span>
          )}
        </span>
        <span className="sr-only">
          {STATE[g.state].label}. You: {names(g.mine)}. Opp: {names(g.theirs)}.
          {impact ? ` Projected points still to come: ${impact}.` : ''}
        </span>
      </span>
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
    <section
      aria-label="Game Day Dashboard"
      className={`${CARD} flex min-w-0 flex-col gap-3 p-4 lg:flex-row lg:items-center ${className}`}
    >
      <Link to="/gameday" className="group flex shrink-0 items-center gap-3 lg:pr-2">
        <Radio size={30} aria-hidden className="text-accent shrink-0" />
        <span className="leading-tight">
          <span className="block text-lg font-extrabold tracking-tight group-hover:underline">Game Day Dashboard</span>
          <span className="text-ink-2 block text-[13px]">
            {live ? `${live} game${live === 1 ? '' : 's'} live now` : 'Live status and impact on your matchup'}
          </span>
          <span className="sr-only"> (open Game Day Live)</span>
        </span>
      </Link>
      {!games ? (
        scheduleQ.isError ? (
          <span className="text-ink-3 text-sm">The NFL schedule could not be loaded.</span>
        ) : (
          <Skeleton className="h-12 flex-1" />
        )
      ) : games.length === 0 ? (
        <span className="text-ink-3 text-sm">No Week {week} games involve your matchup.</span>
      ) : (
        <ul
          aria-label={`Week ${week} games`}
          tabIndex={0}
          className="nav-scroll border-line/60 relative flex min-w-0 flex-1 snap-x overflow-x-auto py-1 lg:border-l"
        >
          {games.map((g) => (
            <Game key={g.id} g={g} />
          ))}
        </ul>
      )}
    </section>
  )
}

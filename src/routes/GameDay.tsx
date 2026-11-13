import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { LeagueGate } from '../components/LeagueGate'
import { LeagueLive } from '../components/league/LeagueLive'
import { WeatherIndicator } from '../components/weather/WeatherIndicator'
import { TeamAvatar } from '../components/ui/Avatar'
import { FreshnessBadge } from '../components/ui/badges'
import { Pill, PosTag } from '../components/ui/Pill'
import { EmptyState, Notice } from '../components/ui/states'
import type { Ready } from '../hooks/useLeagueData'
import { IDLE_POLL_MS, isLive, lineupAlerts, LIVE_POLL_MS, liveSide, liveWinProbability, pollInterval, type GameState, type LiveSide } from '../lib/analytics/gameday'
import { weekContext } from '../lib/analytics/schedule'
import { clamp, f1 } from '../lib/format'
import { findMyMatchup, findOpponent } from '../lib/insights'
import { getMatchups, getSchedule, type SleeperMatchup } from '../lib/sleeper'

const STATE: Record<GameState, { label: string; tone: 'info' | 'prio' | 'neutral' | 'caution' }> = {
  'in-progress': { label: 'Live', tone: 'prio' },
  final: { label: 'Final', tone: 'neutral' },
  'not-started': { label: 'Not started', tone: 'info' },
  bye: { label: 'Bye', tone: 'caution' },
  unknown: { label: '—', tone: 'neutral' },
}

function SideTable({ side, title, teamOf }: { side: LiveSide; title: string; teamOf: (id: string) => string }) {
  return (
    <section aria-label={title} className="border-line bg-card min-w-0 rounded-2xl border p-4">
      <h2 className="mb-2 text-lg font-extrabold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}: live points and projections by starter</caption>
          <thead>
            <tr className="text-ink-3 border-line border-b text-xs">
              <th scope="col" className="py-2 text-left">Slot</th>
              <th scope="col" className="py-2 text-left">Player</th>
              <th scope="col" className="py-2 text-left">Game</th>
              <th scope="col" className="py-2 text-right">Pts</th>
              <th scope="col" className="py-2 text-right">Proj</th>
              <th scope="col" className="py-2 text-right">Left</th>
            </tr>
          </thead>
          <tbody>
            {side.players.map((p, i) => (
              <tr key={`${p.slot}-${i}`} className="border-line/50 border-b">
                <td className="text-ink-3 py-2 text-xs font-extrabold">{p.slot}</td>
                <td className="py-2">
                  {p.id ? (
                    <span className="flex items-center gap-1.5">
                      <PosTag pos={p.pos} />
                      <span className="font-semibold">{p.name}</span>
                      {p.injury && <Pill tone="caution">{p.injury}</Pill>}
                      {p.state === 'not-started' && <WeatherIndicator team={teamOf(p.id)} />}
                    </span>
                  ) : (
                    <span className="text-bad italic">Empty</span>
                  )}
                </td>
                <td className="py-2">{p.id && <Pill tone={STATE[p.state].tone}>{STATE[p.state].label}</Pill>}</td>
                <td className="py-2 text-right font-extrabold">{f1(p.points)}</td>
                <td className="text-ink-3 py-2 text-right">{f1(p.proj)}</td>
                <td className="text-ink-3 py-2 text-right">{f1(p.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GameDayView({ data }: { data: Ready }) {
  const { model: m, league, week, season } = data
  const scheduleQ = useQuery({ queryKey: ['schedule', season], queryFn: () => getSchedule(season), staleTime: 60_000, refetchInterval: IDLE_POLL_MS, retry: 1 })
  const matchupsQ = useQuery({
    queryKey: ['matchups', league.league_id, week],
    queryFn: () => getMatchups(league.league_id, week),
    refetchInterval: (q) => pollInterval(q.state.data as SleeperMatchup[] | undefined, scheduleQ.data, week),
    refetchIntervalInBackground: false,
  })
  const matchups = matchupsQ.data ?? data.matchups
  const ctx = useMemo(() => (scheduleQ.data ? weekContext(scheduleQ.data, week) : null), [scheduleQ.data, week])

  const mineM = findMyMatchup(matchups, m.myRosterId)
  const oppM = findOpponent(matchups, m.myRosterId)
  const me = useMemo(() => (mineM ? liveSide(m, mineM, ctx) : null), [m, mineM, ctx])
  const opp = useMemo(() => (oppM ? liveSide(m, oppM, ctx) : null), [m, oppM, ctx])
  const alerts = useMemo(() => (me && mineM ? lineupAlerts(m, me, mineM, ctx) : []), [m, me, mineM, ctx])
  const live = isLive([me, opp].filter((s): s is LiveSide => !!s))
  const interval = pollInterval(matchups, scheduleQ.data, week)

  if (!me)
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-3 text-2xl font-extrabold tracking-tight">Game Day</h1>
        <EmptyState>No Week {week} matchup is posted for your team.</EmptyState>
      </div>
    )

  const wp = opp ? liveWinProbability(me, opp) : null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Game Day · Week {week}</h1>
        <div className="flex items-center gap-2">
          <FreshnessBadge updatedAt={matchupsQ.dataUpdatedAt || null} label="Live scores updated" staleAfterMin={5} />
          <button
            type="button"
            onClick={() => void matchupsQ.refetch()}
            aria-label="Refresh live scores"
            className="border-line bg-card text-ink-2 hover:text-ink grid size-9 place-items-center rounded-full border"
          >
            <RefreshCw size={16} aria-hidden className={matchupsQ.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <p className="text-ink-3 mb-4 text-sm">
        {interval === LIVE_POLL_MS ? 'Games are live: scores refresh every minute.' : 'Scores refresh every 5 minutes; every minute once games are live.'}{' '}
        <b className="text-good">Points</b> are Sleeper's live scoring; <b className="text-amber">projected final, points left and win odds</b> are model estimates.
      </p>
      {scheduleQ.isError && <Notice>The NFL schedule couldn't be loaded, so game status comes only from points scored.</Notice>}

      <section aria-label="Scoreboard" className="border-line bg-card rounded-2xl border p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {[me, opp].map((s, i) =>
            s ? (
              <div key={s.rosterId} className={`text-center ${i === 1 ? 'order-3' : ''}`}>
                <div className="mb-2 flex justify-center">
                  <TeamAvatar user={m.ownerOf(s.rosterId)} className={`size-14 text-lg ${i === 0 ? 'border-accent border-2' : ''}`} />
                </div>
                <div className="font-bold">{s.name}</div>
                <div className={`text-4xl font-extrabold tracking-tight ${i === 0 ? 'text-accent' : ''}`}>{f1(s.points)}</div>
                <div className="text-ink-3 text-xs">
                  projected final <b className="text-ink-2">{f1(s.projectedFinal)}</b> · {f1(s.remaining)} left
                </div>
              </div>
            ) : (
              <div key="none" className="text-ink-3 order-3 text-center text-sm">No opponent</div>
            ),
          )}
          <span className="text-ink-3 order-2 text-lg font-extrabold">VS</span>
        </div>
        {wp !== null && (
          <>
            <div role="progressbar" aria-label="Live win probability" aria-valuenow={wp} aria-valuemin={0} aria-valuemax={100} className="bg-line mt-4 mb-1 h-3 overflow-hidden rounded-full">
              <span className="from-accent-deep to-accent block h-full rounded-full bg-gradient-to-r" style={{ width: `${clamp(wp, 2, 98)}%` }} />
            </div>
            <div className="text-ink-3 flex justify-between text-sm">
              <span>
                Win probability <b className="text-ink">{wp}%</b> <span className="text-amber text-xs font-bold">MODEL</span>
              </span>
              <span>{live ? 'Live' : 'Pre-game / final'}</span>
            </div>
          </>
        )}
      </section>

      <section aria-label="Lineup alerts" className="border-line bg-card mt-4 rounded-2xl border p-4">
        <h2 className="mb-2 text-lg font-extrabold">Lineup alerts</h2>
        {alerts.length === 0 ? (
          <Notice tone="ok">Nothing to fix among players whose games haven't started.</Notice>
        ) : (
          <ul className="grid gap-2">
            {alerts.map((a, i) => (
              <li key={i} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${a.severity === 'high' ? 'border-bad/40 bg-bad/8' : 'border-amber/40 bg-amber/8'}`}>
                <span className={`text-[11px] font-extrabold uppercase ${a.source === 'fact' ? 'text-good' : 'text-amber'}`}>{a.source === 'fact' ? 'Sleeper' : 'Model'}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/lineup" className="text-accent mt-2 inline-block text-sm font-bold">
          Open the Lineup Optimizer →
        </Link>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SideTable side={me} title="Your starters" teamOf={m.team} />
        {opp && <SideTable side={opp} title={`${opp.name} starters`} teamOf={m.team} />}
      </div>

      <LeagueLive data={data} />
    </div>
  )
}

export default function GameDay() {
  return <LeagueGate>{(data) => <GameDayView data={data} />}</LeagueGate>
}

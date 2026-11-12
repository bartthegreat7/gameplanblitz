import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { ProjNotice } from '../components/cards/shared'
import { BreakoutSpotlight } from '../components/dashboard/BreakoutSpotlight'
import { DashboardBackground } from '../components/dashboard/DashboardBackground'
import { FantasyNews, OptimalLineup, WaiverTargets } from '../components/dashboard/Insights'
import { LeagueRace } from '../components/dashboard/LeagueRace'
import { MatchupHero } from '../components/dashboard/Matchup'
import { QuickAccess } from '../components/dashboard/QuickAccess'
import { StatsBar } from '../components/dashboard/StatsBar'
import { WeeklyGamePlan } from '../components/dashboard/WeeklyGamePlan'
import { WeekSelect } from '../components/layout/Menus'
import { LeagueGate } from '../components/LeagueGate'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useProjectionEngine } from '../hooks/useProjectionEngine'
import { useSession } from '../hooks/useSession'
import { useUsageBook } from '../hooks/useUsageBook'
import { breakouts } from '../lib/analytics/opportunity'
import { findMyMatchup, gameDay } from '../lib/insights'
import { lineupTotal } from '../lib/lineup'
import { getUser } from '../lib/sleeper'
import { useAppStore } from '../store/app'

function Header({ data }: { data: Ready }) {
  const { username, leagues, leagueId } = useSession()
  const setLeagueId = useAppStore((s) => s.setLeagueId)
  const userQ = useQuery({
    queryKey: ['user', username],
    queryFn: () => getUser(username!),
    enabled: !!username,
    staleTime: Infinity,
  })
  const name = userQ.data?.display_name || username || 'Coach'
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-[2.25rem] md:leading-tight">
          Welcome back, {name}
        </h1>
        <p className="text-ink-2 mt-0.5 text-lg">
          Your command center for <b className="text-ink">{data.league.name}</b>
        </p>
        <span aria-hidden className="bg-accent mt-2.5 block h-1 w-20 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {leagues.length > 1 && (
          <label className="border-line bg-card/80 flex h-11 items-center gap-2 rounded-xl border pl-3 backdrop-blur-md">
            <span className="text-ink-3 text-sm font-semibold">League</span>
            <select
              id="league-select"
              value={leagueId ?? ''}
              onChange={(e) => setLeagueId(e.target.value)}
              className="h-full max-w-56 rounded-xl bg-transparent pr-2 font-bold outline-none"
            >
              {leagues.map((l) => (
                <option key={l.league_id} value={l.league_id} className="bg-card">
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <WeekSelect className="bg-card/80 backdrop-blur-md" />
      </div>
    </header>
  )
}

/*
 * Layout (matches design-references/gameplanbitz-dashboard.png), top to bottom:
 *  1. greeting + week picker, over the stadium photo
 *  2. Weekly Game Plan | This Week's Matchup (with the key game's weather)
 *  3. stats bar: projected points, win probability, playoff odds, standing, The Edge
 *  4. Optimal Lineup | Breakout Player Radar | Latest Fantasy News (news full width below 1600px)
 *  5. Top Waiver Targets | League Race (standings + playoff race)
 *  6. Quick access to the original tools
 */
function DashboardView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league } = data
  const gm = useGmBrief(data)
  const engine = useProjectionEngine(data)
  const { book, loading: usageLoading } = useUsageBook(data)
  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  const leagueAvg = useMemo(() => {
    const totals = m.rosters.map((r) => lineupTotal(m.optimal(r.players ?? [])))
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null
  }, [m])
  const radar = useMemo(() => breakouts(book, m.pos), [book, m])
  // the game whose weather matters most: a starter with flagged weather, else my first starter (the QB)
  const weatherPlayer = useMemo(() => {
    const flagged = gm.allActions.find((a) => a.area === 'weather' && a.playerId)?.playerId
    const first = (findMyMatchup(matchups, m.myRosterId)?.starters ?? []).find(
      (id) => id && id !== '0',
    )
    return flagged ?? first ?? null
  }, [gm.allActions, matchups, m.myRosterId])

  return (
    <>
      <DashboardBackground />
      <div className="grid grid-cols-1 gap-4">
        <Header data={data} />
        <ProjNotice data={data} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <WeeklyGamePlan
            actions={gm.brief.actions}
            week={week}
            pending={gm.pending.length > 0}
            players={m.players}
          />
          <MatchupHero
            m={m}
            matchups={matchups}
            gd={gd}
            week={week}
            weatherPlayer={weatherPlayer}
          />
        </div>

        <StatsBar
          m={m}
          gd={gd}
          leagueAvg={leagueAvg}
          odds={gm.playoff}
          oddsLoading={gm.playoffLoading}
          actions={gm.allActions.filter((a) => a.priority <= 2).length}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 3xl:grid-cols-3">
          <OptimalLineup analysis={gm.lineup} week={week} />
          <BreakoutSpotlight
            m={m}
            list={radar}
            games={(id) => book.games.get(id) ?? []}
            projOf={(id) => engine.projectionFor(id).value}
            loading={usageLoading}
          />
          <FantasyNews news={gm.news} className="lg:col-span-2 3xl:col-span-1" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <WaiverTargets m={m} report={gm.waivers} loading={gm.waiversLoading} />
          <LeagueRace
            m={m}
            leagueName={league.name}
            playoffTeams={gm.playoffTeams}
            odds={gm.playoff}
            loading={gm.playoffLoading}
            seasonDone={gm.seasonDone}
            divisions={league.settings.divisions ?? 0}
          />
        </div>

        <QuickAccess data={data} />
      </div>
    </>
  )
}

export default function Dashboard() {
  return <LeagueGate>{(data) => <DashboardView data={data} />}</LeagueGate>
}

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FileText } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { GameDayCard } from '../components/cards/GameDayCard'
import { LineupCheckCard } from '../components/cards/LineupCheckCard'
import { StandingsCard } from '../components/cards/RosterCards'
import { ProjNotice } from '../components/cards/shared'
import { ActionItems } from '../components/command/ActionItems'
import { BreakoutRadar } from '../components/command/BreakoutRadar'
import { CommandHeader } from '../components/command/CommandHeader'
import { GameDayStrip } from '../components/command/GameDayStrip'
import { GmPanel } from '../components/command/GmPanel'
import { MyTeam } from '../components/command/MyTeam'
import { PodcastPanel } from '../components/command/PodcastPanel'
import { isTab, type TabId } from '../components/command/tabs'
import { WeatherWatch } from '../components/command/WeatherWatch'
import { Welcome } from '../components/command/Welcome'
import { DashboardBackground } from '../components/dashboard/DashboardBackground'
import { FantasyNews, OptimalLineup, WaiverTargets } from '../components/dashboard/Insights'
import { LeagueRace } from '../components/dashboard/LeagueRace'
import { MatchupHero } from '../components/dashboard/Matchup'
import { QuickAccess } from '../components/dashboard/QuickAccess'
import { CARD } from '../components/dashboard/styles'
import { WeeklyGamePlan } from '../components/dashboard/WeeklyGamePlan'
import { WeeklyReport } from '../components/gm/WeeklyReport'
import { LeagueGate } from '../components/LeagueGate'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useOddsHistory } from '../hooks/useOddsHistory'
import { useProjectionEngine } from '../hooks/useProjectionEngine'
import { useSession } from '../hooks/useSession'
import { useUsageBook } from '../hooks/useUsageBook'
import { actionItems, teamHealth } from '../lib/analytics/command'
import { breakouts } from '../lib/analytics/opportunity'
import { findMyMatchup, gameDay } from '../lib/insights'
import { getUser } from '../lib/sleeper'

const LINKS: [string, string][] = [
  ['/scouting', 'Opponent Scouting'],
  ['/gameday', 'Game Day Live'],
  ['/startsit', 'Start/Sit Simulator'],
  ['/weather', 'Weather Watch'],
]

function MoreLinks({ links }: { links: [string, string][] }) {
  return (
    <nav aria-label="Related tools" className="flex flex-wrap gap-2">
      {links.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          className="border-line/70 bg-card/80 hover:border-accent/50 inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-bold backdrop-blur-md transition-colors"
        >
          {label} <ArrowRight size={14} aria-hidden className="text-accent" />
        </Link>
      ))}
    </nav>
  )
}

/*
 * Command Center layout (desktop, top to bottom):
 *   center column: title + view tabs, then the selected view
 *     Overview: greeting + 4 stat cards | This Week's Matchup + Top Action Items |
 *               Optimal Lineup + Breakout Radar + Fantasy News
 *   right column (xl+): AI Fantasy GM chat, AI Podcast
 *   bottom (Overview): Game Day Dashboard strip + Weather Watch
 * Below xl the right column follows the main content. The other tabs hold every earlier
 * dashboard panel and tool card, so nothing was removed.
 */
function DashboardView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league } = data
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = isTab(raw) ? raw : 'overview'
  const setTab = (t: TabId) => setParams(t === 'overview' ? {} : { tab: t })

  const { username } = useSession()
  const userQ = useQuery({
    queryKey: ['user', username],
    queryFn: () => getUser(username!),
    enabled: !!username,
    staleTime: Infinity,
  })
  const name = userQ.data?.display_name || username || 'Coach'

  const gm = useGmBrief(data)
  const engine = useProjectionEngine(data)
  const { book, loading: usageLoading } = useUsageBook(data)
  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  const plan = gm.lineup?.plan ?? null
  const health = useMemo(() => (plan ? teamHealth(plan) : null), [plan])
  const oddsChange = useOddsHistory(league.league_id, week, gm.playoff?.playoffPct ?? null)
  const radar = useMemo(() => breakouts(book, m.pos), [book, m])
  const projOf = useCallback((id: string) => engine.projectionFor(id).value, [engine])
  const weatherFlags = gm.allActions.filter((a) => a.area === 'weather').length
  const items = useMemo(
    () =>
      actionItems({
        plan,
        health,
        waivers: gm.waivers
          ? {
              upgrades: gm.waivers.candidates
                .filter((c) => c.kind === 'upgrade')
                .map((c) => ({ name: c.name, gain: c.gainPerWeek })),
            }
          : null,
        trades: gm.trades ? { mutual: gm.trades.mutual.length } : null,
        weatherFlags: gm.weatherLoading ? null : weatherFlags,
        weatherChecked: gm.weatherChecked,
      }),
    [plan, health, gm.waivers, gm.trades, gm.weatherLoading, gm.weatherChecked, weatherFlags],
  )
  // the game whose weather the Matchup view shows: a starter with flagged weather, else my first starter
  const weatherPlayer = useMemo(() => {
    const flagged = gm.allActions.find((a) => a.area === 'weather' && a.playerId)?.playerId
    const first = (findMyMatchup(matchups, m.myRosterId)?.starters ?? []).find((id) => id && id !== '0')
    return flagged ?? first ?? null
  }, [gm.allActions, matchups, m.myRosterId])

  return (
    <>
      <DashboardBackground />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23.5rem] 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="@container/main grid min-w-0 content-start gap-5">
          <CommandHeader tab={tab} onTab={setTab} />
          <ProjNotice data={data} />
          <div
            role="tabpanel"
            id={`cc-panel-${tab}`}
            aria-labelledby={`cc-tab-${tab}`}
            className="grid min-w-0 gap-5"
          >
            {tab === 'overview' && (
              <>
                <Welcome
                  name={name}
                  week={week}
                  leagueName={league.name}
                  gd={gd}
                  health={health}
                  odds={gm.playoff}
                  oddsLoading={gm.playoffLoading}
                  oddsChange={oddsChange}
                  seasonDone={gm.seasonDone}
                />
                <div className="grid grid-cols-1 gap-5 @[46rem]/main:grid-cols-2">
                  <MatchupHero
                    m={m}
                    matchups={matchups}
                    gd={gd}
                    week={week}
                    weatherPlayer={null}
                    analysisTo="/?tab=matchup"
                  />
                  <ActionItems items={items} />
                </div>
                <div className="grid grid-cols-1 gap-5 @[46rem]/main:grid-cols-2 @[68rem]/main:grid-cols-3">
                  <OptimalLineup analysis={gm.lineup} week={week} projOf={projOf} />
                  <BreakoutRadar
                    m={m}
                    list={radar}
                    book={book}
                    projOf={projOf}
                    loading={usageLoading}
                  />
                  <FantasyNews
                    news={gm.news}
                    className="@[46rem]/main:col-span-2 @[68rem]/main:col-span-1"
                  />
                </div>
              </>
            )}

            {tab === 'team' && <MyTeam data={data} gm={gm} projOf={projOf} />}

            {tab === 'matchup' && (
              <>
                <MatchupHero
                  m={m}
                  matchups={matchups}
                  gd={gd}
                  week={week}
                  weatherPlayer={weatherPlayer}
                />
                <div className="grid grid-cols-1 items-start gap-5 @[52rem]/main:grid-cols-2">
                  <GameDayCard data={data} />
                  <LineupCheckCard data={data} />
                </div>
                <MoreLinks links={LINKS} />
              </>
            )}

            {tab === 'league' && (
              <>
                <LeagueRace
                  m={m}
                  leagueName={league.name}
                  playoffTeams={gm.playoffTeams}
                  odds={gm.playoff}
                  loading={gm.playoffLoading}
                  seasonDone={gm.seasonDone}
                  divisions={league.settings.divisions ?? 0}
                />
                <StandingsCard data={data} />
                <MoreLinks
                  links={[
                    ['/playoffs', 'Playoff Simulator'],
                    ['/standings', 'Full standings'],
                    ['/scouting', 'Scout any team'],
                  ]}
                />
              </>
            )}

            {tab === 'strategy' && (
              <>
                <div className="grid grid-cols-1 gap-5 @[52rem]/main:grid-cols-2">
                  <WeeklyGamePlan
                    actions={gm.brief.actions}
                    week={week}
                    pending={gm.pending.length > 0}
                    players={m.players}
                  />
                  <WaiverTargets m={m} report={gm.waivers} loading={gm.waiversLoading} />
                </div>
                <QuickAccess data={data} />
              </>
            )}

            {tab === 'reports' && (
              <section aria-label="Reports" className={`${CARD} grid gap-4 p-5 sm:p-6`}>
                <div className="flex items-start gap-3">
                  <span className="bg-accent/12 text-accent grid size-10 shrink-0 place-items-center rounded-xl">
                    <FileText size={20} aria-hidden />
                  </span>
                  <p className="text-ink-2 text-sm">
                    The Fantasy GM&apos;s rules-based weekly report, built from the same tools as the
                    rest of the app. It adds no numbers of its own.
                  </p>
                </div>
                <WeeklyReport data={data} gm={gm} />
                <MoreLinks
                  links={[
                    ['/gm', 'Weekly GM Brief'],
                    ['/accuracy', 'Projection Accuracy'],
                    ['/alerts', 'Alert Center'],
                    ['/studio?view=library', 'Podcast episodes'],
                  ]}
                />
              </section>
            )}
          </div>
        </div>

        <aside aria-label="AI Fantasy GM and podcast" className="grid min-w-0 content-start gap-5">
          <GmPanel data={data} />
          <PodcastPanel leagueId={league.league_id} />
        </aside>

        {tab === 'overview' && (
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] xl:col-span-2">
            <GameDayStrip data={data} />
            <WeatherWatch week={week} />
          </div>
        )}
      </div>
    </>
  )
}

export default function Dashboard() {
  return <LeagueGate>{(data) => <DashboardView data={data} />}</LeagueGate>
}

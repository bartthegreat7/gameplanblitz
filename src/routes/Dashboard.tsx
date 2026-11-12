import { useQuery } from '@tanstack/react-query'
import { BarChart3, Target, Trophy } from 'lucide-react'
import { useMemo } from 'react'

import { EdgeCard } from '../components/cards/EdgeCard'
import { GameDayCard } from '../components/cards/GameDayCard'
import { LineupCheckCard } from '../components/cards/LineupCheckCard'
import { NewsCard } from '../components/cards/NewsCard'
import { PlayerValueCard, RosterCard } from '../components/cards/RosterCards'
import { ProjNotice } from '../components/cards/shared'
import { TradeMachineCard } from '../components/cards/TradeMachineCard'
import { WaiverBidsCard, WaiverWireCard } from '../components/cards/WaiverCards'
import { StatCard } from '../components/dashboard/DashboardCard'
import { MatchupCard, PlayoffProbability, StandingsTable } from '../components/dashboard/SecondRow'
import { FantasyNews, OptimalLineup, WaiverTargets } from '../components/dashboard/ThirdRow'
import { WeeklyGamePlan } from '../components/dashboard/WeeklyGamePlan'
import { LeagueGate } from '../components/LeagueGate'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useSession } from '../hooks/useSession'
import { f1, signed } from '../lib/format'
import { gameDay } from '../lib/insights'
import { lineupTotal } from '../lib/lineup'
import { getUser } from '../lib/sleeper'
import { useAppStore } from '../store/app'

const pct = (x: number) => (x >= 99.95 ? '100%' : x > 0 && x < 0.5 ? '<1%' : `${Math.round(x)}%`)

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
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="text-4xl leading-none" aria-hidden>
        👋
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Welcome back, {name}</h1>
        <p className="text-ink-2">
          Your fantasy command center for <b className="text-ink">{data.league.name}</b> · Week{' '}
          {data.week}
        </p>
      </div>
      {leagues.length > 1 && (
        <label className="border-line bg-card flex h-11 items-center gap-2 rounded-xl border pl-3">
          <span className="text-ink-3 text-sm font-semibold">League</span>
          <select
            id="league-select"
            value={leagueId ?? ''}
            onChange={(e) => setLeagueId(e.target.value)}
            className="bg-card h-full max-w-56 rounded-xl pr-2 font-bold outline-none"
          >
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </header>
  )
}

function DashboardView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league } = data
  const gm = useGmBrief(data)
  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  // league average of each team's best projected lineup (same method as the projected score)
  const leagueAvg = useMemo(() => {
    const totals = m.rosters.map((r) => lineupTotal(m.optimal(r.players ?? [])))
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null
  }, [m])
  const odds = gm.playoff

  return (
    <div className="grid grid-cols-1 gap-4">
      <Header data={data} />
      <ProjNotice data={data} />

      {/* row 1: game plan + headline numbers */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,3fr)]">
        <WeeklyGamePlan actions={gm.brief.actions} week={week} pending={gm.pending.length > 0} />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Projected Score"
            icon={Target}
            tone="good"
            value={gd ? f1(gd.myProj) : '—'}
            sub={
              gd && leagueAvg !== null ? (
                <>
                  <b className={gd.myProj >= leagueAvg ? 'text-good' : 'text-bad'}>
                    {gd.myProj >= leagueAvg ? '▲' : '▼'} {signed(gd.myProj - leagueAvg)}
                  </b>{' '}
                  vs. league avg
                </>
              ) : (
                'No matchup posted'
              )
            }
            to="/lineup"
          />
          <StatCard
            title="Win Probability"
            icon={Trophy}
            tone="amber"
            model
            value={gd && gd.oppRosterId !== null ? `${gd.winPct}%` : '—'}
            meter={gd && gd.oppRosterId !== null ? gd.winPct : null}
            sub={gd && gd.oppRosterId !== null ? `vs. ${gd.oppName}` : 'No opponent this week'}
            to="/gameday"
          />
          <StatCard
            title="Playoff Odds"
            icon={BarChart3}
            tone="good"
            model
            value={odds ? pct(odds.playoffPct) : gm.playoffLoading ? '…' : '—'}
            meter={odds ? odds.playoffPct : null}
            sub={
              odds
                ? `Title odds ${pct(odds.championPct)}`
                : gm.playoffLoading
                  ? 'Simulating…'
                  : gm.seasonDone
                    ? 'Regular season over'
                    : 'Schedule not posted'
            }
            to="/playoffs"
          />
        </div>
      </div>

      {/* row 2: matchup, standings, playoff race */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <MatchupCard m={m} matchups={matchups} gd={gd} week={week} />
        <StandingsTable m={m} leagueName={league.name} />
        <div className="md:col-span-2 xl:col-span-1 [&>section]:h-full">
          <PlayoffProbability
            odds={odds}
            loading={gm.playoffLoading}
            seasonDone={gm.seasonDone}
            playoffTeams={gm.playoffTeams}
            divisions={league.settings.divisions ?? 0}
          />
        </div>
      </div>

      {/* row 3: lineup, waivers, news */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="md:col-span-2 xl:col-span-1 [&>section]:h-full">
          <OptimalLineup m={m} analysis={gm.lineup} week={week} />
        </div>
        <WaiverTargets m={m} report={gm.waivers} loading={gm.waiversLoading} />
        <FantasyNews news={gm.news} />
      </div>

      {/* the original dashboard tools, unchanged */}
      <section aria-labelledby="more-tools" className="mt-4">
        <h2 id="more-tools" className="mb-3 text-xl font-extrabold tracking-tight">
          More tools
        </h2>
        <div className="lg:columns-2 lg:gap-4 2xl:columns-3">
          <GameDayCard data={data} />
          <LineupCheckCard data={data} />
          <EdgeCard data={data} />
          <NewsCard data={data} />
          <TradeMachineCard data={data} />
          <WaiverWireCard data={data} />
          <WaiverBidsCard data={data} />
          <RosterCard data={data} />
          <PlayerValueCard data={data} />
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  return <LeagueGate>{(data) => <DashboardView data={data} />}</LeagueGate>
}

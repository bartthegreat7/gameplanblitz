import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { ProjNotice } from '../components/cards/shared'
import { FantasyNews, OptimalLineup, WaiverTargets } from '../components/dashboard/Insights'
import { LeagueRace } from '../components/dashboard/LeagueRace'
import { MatchupHero } from '../components/dashboard/Matchup'
import { QuickAccess } from '../components/dashboard/QuickAccess'
import { SeasonStrip } from '../components/dashboard/SeasonStrip'
import { WeeklyGamePlan } from '../components/dashboard/WeeklyGamePlan'
import { LeagueGate } from '../components/LeagueGate'
import { useGmBrief } from '../hooks/useGmBrief'
import type { Ready } from '../hooks/useLeagueData'
import { useSession } from '../hooks/useSession'
import { gameDay } from '../lib/insights'
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
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="text-4xl leading-none" aria-hidden>
        👋
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[2rem] md:leading-tight">
          Welcome back, {name}
        </h1>
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

/*
 * Layout, top to bottom:
 *  1. hero: Weekly Game Plan + This Week's Matchup (the two focal points)
 *  2. season strip: four facts not shown anywhere else on the page
 *  3. league race: standings + playoff odds in one panel
 *  4. insights: lineup + waivers side by side (equal height) with news as a full-width row of cards;
 *     three equal columns from 1600px (news switches layout by container width)
 *  5. quick access: the original tools, each in a side panel
 * Every number appears once.
 */
function DashboardView({ data }: { data: Ready }) {
  const { model: m, matchups, week, league } = data
  const gm = useGmBrief(data)
  const gd = useMemo(() => gameDay(m, matchups), [m, matchups])
  // league average of each team's best projected lineup (same method as the projected score)
  const leagueAvg = useMemo(() => {
    const totals = m.rosters.map((r) => lineupTotal(m.optimal(r.players ?? [])))
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null
  }, [m])

  return (
    <div className="grid grid-cols-1 gap-6">
      <Header data={data} />
      <ProjNotice data={data} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <WeeklyGamePlan actions={gm.brief.actions} week={week} pending={gm.pending.length > 0} />
        <MatchupHero m={m} matchups={matchups} gd={gd} week={week} />
      </div>

      <SeasonStrip
        m={m}
        league={league}
        matchups={matchups}
        myProj={gd ? gd.myProj : null}
        leagueAvg={leagueAvg}
      />

      <LeagueRace
        m={m}
        leagueName={league.name}
        playoffTeams={gm.playoffTeams}
        odds={gm.playoff}
        loading={gm.playoffLoading}
        seasonDone={gm.seasonDone}
        divisions={league.settings.divisions ?? 0}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 3xl:grid-cols-3">
        <OptimalLineup m={m} analysis={gm.lineup} week={week} />
        <WaiverTargets m={m} report={gm.waivers} loading={gm.waiversLoading} />
        <FantasyNews news={gm.news} className="lg:col-span-2 3xl:col-span-1" />
      </div>

      <QuickAccess data={data} />
    </div>
  )
}

export default function Dashboard() {
  return <LeagueGate>{(data) => <DashboardView data={data} />}</LeagueGate>
}

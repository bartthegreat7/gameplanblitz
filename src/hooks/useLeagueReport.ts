import { useMemo } from 'react'

import { movers, powerRankings, storylines, weekAwards } from '../lib/analytics/league'
import { simulate, type TeamOdds } from '../lib/analytics/playoffs'
import type { BoardGame } from '../lib/analytics/scoreboard'
import { lineupTotal } from '../lib/lineup'
import type { Ready } from './useLeagueData'
import { useLeagueSeason } from './useLeagueSeason'
import { useSeasonSim } from './useSeasonSim'
import { useSession } from './useSession'

/**
 * Everything "Around the League" needs beyond the live board: the last completed week's awards
 * and storylines, power rankings with movers, and playoff odds for every team.
 */
export function useLeagueReport(data: Ready, games: BoardGame[], gamesFinal: boolean) {
  const { model: m, week, league } = data
  const { currentWeek } = useSession()
  const { season, loading } = useLeagueSeason(data)
  const sim = useSeasonSim(data)
  const reportWeek = gamesFinal ? week : week - 1
  const through = Math.min(week, currentWeek - 1)
  const result = useMemo(() => {
    const done = season.filter((w) => w.week <= through)
    const wk = done.find((w) => w.week === reportWeek)
    // upsets need pre-game projections: the viewed week's board carries them
    const pregame = new Map(games.flatMap((g) => (g.b ? [g.a, g.b] : [g.a])).map((s) => [s.rosterId, s.pregame]))
    const awards = wk ? weekAwards(wk.games, reportWeek === week ? (id) => pregame.get(id) ?? null : undefined) : null
    const stories = wk ? storylines(done, reportWeek, m.teamName, league.settings.playoff_teams ?? 6) : []
    const strength = new Map(m.rosters.map((r) => [r.roster_id, lineupTotal(m.optimal(r.players ?? []))]))
    const power = through >= 1 ? powerRankings(done, through, strength) : []
    const prev = through >= 2 ? powerRankings(done, through - 1, null) : []
    const change = new Map(movers(prev, power).map((x) => [x.rosterId, x.change]))
    return { awards, stories, power, change }
  }, [season, through, reportWeek, week, games, m, league.settings.playoff_teams])
  const odds = useMemo<TeamOdds[] | null>(() => (sim.input ? simulate(sim.input) : null), [sim.input])
  return { ...result, reportWeek, through, odds, loading: loading || sim.loading }
}
